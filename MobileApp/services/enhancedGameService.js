const axios = require('axios');
const crypto = require('crypto');
const { AppError } = require('../utils/errorHandler');
const { logger, auditLogger } = require('../utils/logger');
const { hashData } = require('../utils/cryptoUtils');
const db = require('../Models');

class EnhancedGameService {
  constructor() {
    this.apiCache = new Map();
    this.fraudDetector = new FraudDetectionService();
    this.statsComparator = new StatsComparator();
    
    this.supportedGames = {
      'league_of_legends': {
        name: 'League of Legends',
        apiEndpoint: 'https://na1.api.riotgames.com',
        requiredStats: ['rank', 'winRate', 'kda'],
        apiKey: process.env.RIOT_API_KEY,
        rateLimit: { requests: 100, window: 120000 }, // 100 req/2min
        regions: ['na1', 'euw1', 'eun1', 'kr', 'jp1'],
        skillMetrics: {
          'IRON': { min: 0, max: 199 },
          'BRONZE': { min: 200, max: 399 },
          'SILVER': { min: 400, max: 599 },
          'GOLD': { min: 600, max: 799 },
          'PLATINUM': { min: 800, max: 999 },
          'DIAMOND': { min: 1000, max: 1199 },
          'MASTER': { min: 1200, max: 1399 },
          'GRANDMASTER': { min: 1400, max: 1599 },
          'CHALLENGER': { min: 1600, max: 2000 }
        }
      },
      'valorant': {
        name: 'Valorant',
        apiEndpoint: 'https://api.henrikdev.xyz/valorant',
        requiredStats: ['rank', 'rr', 'peakRank'],
        apiKey: process.env.VALORANT_API_KEY,
        rateLimit: { requests: 60, window: 60000 },
        regions: ['na', 'eu', 'ap', 'kr'],
        skillMetrics: {
          'Iron': { min: 0, max: 299 },
          'Bronze': { min: 300, max: 599 },
          'Silver': { min: 600, max: 899 },
          'Gold': { min: 900, max: 1199 },
          'Platinum': { min: 1200, max: 1499 },
          'Diamond': { min: 1500, max: 1799 },
          'Ascendant': { min: 1800, max: 2099 },
          'Immortal': { min: 2100, max: 2399 },
          'Radiant': { min: 2400, max: 3000 }
        }
      },
      'counter_strike': {
        name: 'Counter-Strike 2',
        apiEndpoint: 'https://api.steampowered.com',
        requiredStats: ['kills', 'deaths', 'kdr', 'wins'],
        apiKey: process.env.STEAM_API_KEY,
        rateLimit: { requests: 200, window: 300000 }, // 200 req/5min
        skillMetrics: {
          'Silver': { min: 0, max: 499 },
          'Gold Nova': { min: 500, max: 799 },
          'Master Guardian': { min: 800, max: 1099 },
          'Legendary Eagle': { min: 1100, max: 1399 },
          'Supreme': { min: 1400, max: 1699 },
          'Global Elite': { min: 1700, max: 2000 }
        }
      }
    };
  }

  // Enhanced stats fetching with validation and fraud detection
  async fetchPlayerStatsWithValidation(game, gameAccount, userId) {
    try {
      // Check rate limits
      await this.checkRateLimit(game, userId);
      
      // Validate game account format
      this.validateGameAccountFormat(game, gameAccount);
      
      // Check cache first
      const cacheKey = `${game}_${hashData(gameAccount)}`;
      const cached = this.apiCache.get(cacheKey);
      if (cached && (Date.now() - cached.timestamp) < 300000) { // 5 min cache
        logger.info(`Using cached data for ${game}:${gameAccount}`);
        return cached.data;
      }

      // Fetch stats based on game
      let stats, fraudScore, warnings = [];
      
      switch (game) {
        case 'league_of_legends':
          stats = await this.fetchLeagueStatsAdvanced(gameAccount);
          break;
        case 'valorant':
          stats = await this.fetchValorantStatsAdvanced(gameAccount);
          break;
        case 'counter_strike':
          stats = await this.fetchCSStatsAdvanced(gameAccount);
          break;
        default:
          throw new AppError(`Unsupported game: ${game}`, 400);
      }

      // Run fraud detection
      fraudScore = await this.fraudDetector.analyzeStats(game, gameAccount, stats, userId);
      
      // Generate warnings if needed
      if (fraudScore > 30) {
        warnings.push('Unusual stat patterns detected');
      }
      if (fraudScore > 70) {
        warnings.push('High fraud risk - manual review required');
      }

      // Assess skill level
      const skillLevel = this.assessSkillLevelAdvanced(game, stats);
      
      const result = {
        game,
        gameAccount,
        stats,
        skillLevel,
        fraudScore,
        warnings,
        fetchedAt: new Date(),
        source: this.supportedGames[game].apiEndpoint,
        cacheKey
      };

      // Cache the result
      this.apiCache.set(cacheKey, {
        data: result,
        timestamp: Date.now()
      });

      auditLogger.info('Stats fetched successfully', {
        game,
        gameAccount: gameAccount.substring(0, 8) + '...',
        skillLevel,
        fraudScore
      });

      return result;
      
    } catch (error) {
      auditLogger.error('Stats fetch failed', {
        game,
        gameAccount: gameAccount.substring(0, 8) + '...',
        error: error.message
      });
      throw error;
    }
  }

  // Advanced League of Legends stats with multiple data points
  async fetchLeagueStatsAdvanced(summonerName, region = 'na1') {
    const config = this.supportedGames.league_of_legends;
    const headers = { 'X-Riot-Token': config.apiKey };
    const baseUrl = `https://${region}.api.riotgames.com`;
    
    try {
      // Get summoner data
      const summonerResponse = await axios.get(
        `${baseUrl}/lol/summoner/v4/summoners/by-name/${encodeURIComponent(summonerName)}`,
        { headers, timeout: 10000 }
      );
      
      const { id: summonerId, puuid, summonerLevel } = summonerResponse.data;
      
      // Get ranked stats
      const rankedResponse = await axios.get(
        `${baseUrl}/lol/league/v4/entries/by-summoner/${summonerId}`,
        { headers, timeout: 10000 }
      );
      
      // Get match history for deeper analysis
      const matchHistoryResponse = await axios.get(
        `https://americas.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?count=20`,
        { headers, timeout: 15000 }
      );
      
      // Analyze recent matches
      const recentMatches = await this.analyzeRecentMatches(matchHistoryResponse.data, headers);
      
      const soloQueue = rankedResponse.data.find(entry => entry.queueType === 'RANKED_SOLO_5x5');
      const flexQueue = rankedResponse.data.find(entry => entry.queueType === 'RANKED_FLEX_SR');
      
      const stats = {
        summonerLevel,
        soloQueue: {
          tier: soloQueue?.tier || 'UNRANKED',
          rank: soloQueue?.rank || '',
          leaguePoints: soloQueue?.leaguePoints || 0,
          wins: soloQueue?.wins || 0,
          losses: soloQueue?.losses || 0,
          winRate: soloQueue ? (soloQueue.wins / (soloQueue.wins + soloQueue.losses) * 100).toFixed(2) : 0
        },
        flexQueue: {
          tier: flexQueue?.tier || 'UNRANKED',
          rank: flexQueue?.rank || '',
          leaguePoints: flexQueue?.leaguePoints || 0,
          wins: flexQueue?.wins || 0,
          losses: flexQueue?.losses || 0
        },
        recentPerformance: {
          averageKDA: recentMatches.averageKDA,
          winRateRecent: recentMatches.winRate,
          mostPlayedRole: recentMatches.mostPlayedRole,
          averageDamage: recentMatches.averageDamage,
          visionScore: recentMatches.averageVisionScore
        }
      };

      return stats;
      
    } catch (error) {
      if (error.response?.status === 404) {
        throw new AppError('Summoner not found', 404);
      } else if (error.response?.status === 429) {
        throw new AppError('Rate limit exceeded for Riot API', 429);
      } else if (error.response?.status === 403) {
        throw new AppError('Invalid API key for Riot Games', 403);
      }
      throw new AppError(`Failed to fetch League stats: ${error.message}`, 500);
    }
  }

  // Advanced Valorant stats
  async fetchValorantStatsAdvanced(playerTag) {
    const [name, tag] = playerTag.split('#');
    if (!name || !tag) {
      throw new AppError('Invalid Valorant player tag format. Use Name#Tag', 400);
    }

    const config = this.supportedGames.valorant;
    
    try {
      // Get account info
      const accountResponse = await axios.get(
        `${config.apiEndpoint}/v1/account/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`,
        { timeout: 10000 }
      );
      
      // Get MMR data
      const mmrResponse = await axios.get(
        `${config.apiEndpoint}/v2/mmr/na/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`,
        { timeout: 10000 }
      );
      
      // Get recent matches
      const matchesResponse = await axios.get(
        `${config.apiEndpoint}/v3/matches/na/${encodeURIComponent(name)}/${encodeURIComponent(tag)}?filter=competitive`,
        { timeout: 15000 }
      );

      const recentMatches = this.analyzeValorantMatches(matchesResponse.data.data);
      
      const stats = {
        accountLevel: accountResponse.data.account_level,
        currentRank: {
          tier: mmrResponse.data.current_data.currenttierpatched || 'Unranked',
          rr: mmrResponse.data.current_data.ranking_in_tier || 0,
          mmr: mmrResponse.data.current_data.elo || 0
        },
        peakRank: {
          tier: mmrResponse.data.highest_rank?.patched_tier || 'N/A',
          season: mmrResponse.data.highest_rank?.season || 'N/A'
        },
        recentPerformance: {
          averageScore: recentMatches.averageScore,
          kdr: recentMatches.kdr,
          headShotPercentage: recentMatches.headShotPercentage,
          winRate: recentMatches.winRate,
          mostPlayedAgent: recentMatches.mostPlayedAgent,
          averageDamage: recentMatches.averageDamage
        }
      };

      return stats;
      
    } catch (error) {
      if (error.response?.status === 404) {
        throw new AppError('Valorant player not found', 404);
      } else if (error.response?.status === 429) {
        throw new AppError('Rate limit exceeded for Valorant API', 429);
      }
      throw new AppError(`Failed to fetch Valorant stats: ${error.message}`, 500);
    }
  }

  // Advanced Counter-Strike stats
  async fetchCSStatsAdvanced(steamId) {
    if (!steamId.match(/^\d{17}$/)) {
      throw new AppError('Invalid Steam ID format', 400);
    }

    const config = this.supportedGames.counter_strike;
    
    try {
      // Get player stats
      const statsResponse = await axios.get(
        `${config.apiEndpoint}/ISteamUserStats/GetUserStatsForGame/v0002/`,
        {
          params: {
            appid: 730, // CS2 app ID
            key: config.apiKey,
            steamid: steamId
          },
          timeout: 10000
        }
      );

      // Get player summary
      const summaryResponse = await axios.get(
        `${config.apiEndpoint}/ISteamUser/GetPlayerSummaries/v0002/`,
        {
          params: {
            key: config.apiKey,
            steamids: steamId
          },
          timeout: 10000
        }
      );

      const rawStats = statsResponse.data.playerstats.stats;
      const playerInfo = summaryResponse.data.response.players[0];

      // Extract key statistics
      const kills = this.getStatValue(rawStats, 'total_kills');
      const deaths = this.getStatValue(rawStats, 'total_deaths') || 1;
      const assists = this.getStatValue(rawStats, 'total_kills_knife');
      const wins = this.getStatValue(rawStats, 'total_wins');
      const rounds = this.getStatValue(rawStats, 'total_rounds_played') || 1;
      const headshots = this.getStatValue(rawStats, 'total_kills_headshot');
      const bombsPlanted = this.getStatValue(rawStats, 'total_bombs_planted');
      const bombsDefused = this.getStatValue(rawStats, 'total_bombs_defused');

      const stats = {
        playerInfo: {
          steamId,
          personaName: playerInfo.personaname,
          profileUrl: playerInfo.profileurl,
          accountCreated: new Date(playerInfo.timecreated * 1000)
        },
        combat: {
          kills,
          deaths,
          assists,
          kdr: (kills / deaths).toFixed(2),
          kda: ((kills + assists) / deaths).toFixed(2),
          headShotPercentage: kills > 0 ? ((headshots / kills) * 100).toFixed(2) : 0
        },
        matches: {
          wins,
          totalRounds: rounds,
          winRate: ((wins / rounds) * 100).toFixed(2)
        },
        objectives: {
          bombsPlanted,
          bombsDefused,
          utilityScore: bombsPlanted + bombsDefused
        }
      };

      return stats;
      
    } catch (error) {
      if (error.response?.status === 404) {
        throw new AppError('Steam player not found or profile is private', 404);
      } else if (error.response?.status === 403) {
        throw new AppError('Invalid Steam API key', 403);
      }
      throw new AppError(`Failed to fetch CS2 stats: ${error.message}`, 500);
    }
  }

  // Helper methods
  getStatValue(stats, statName) {
    const stat = stats.find(s => s.name === statName);
    return stat ? stat.value : 0;
  }

  analyzeRecentMatches(matchIds, headers) {
    // Implementation for analyzing League matches
    // This would fetch detailed match data and calculate performance metrics
    return {
      averageKDA: 2.1,
      winRate: 65,
      mostPlayedRole: 'ADC',
      averageDamage: 18500,
      averageVisionScore: 15
    };
  }

  analyzeValorantMatches(matches) {
    if (!matches || matches.length === 0) {
      return {
        averageScore: 0,
        kdr: 0,
        headShotPercentage: 0,
        winRate: 0,
        mostPlayedAgent: 'Unknown',
        averageDamage: 0
      };
    }

    const totalMatches = matches.length;
    let totalScore = 0, totalKills = 0, totalDeaths = 0;
    let totalHeadshots = 0, totalShots = 0, wins = 0;
    let totalDamage = 0;
    const agentCounts = {};

    matches.forEach(match => {
      const playerStats = match.players.all_players.find(p => p.puuid === match.puuid);
      if (playerStats) {
        totalScore += playerStats.stats.score;
        totalKills += playerStats.stats.kills;
        totalDeaths += playerStats.stats.deaths || 1;
        totalHeadshots += playerStats.stats.headshots;
        totalShots += playerStats.stats.bodyshots + playerStats.stats.headshots + playerStats.stats.legshots;
        totalDamage += playerStats.damage_made;
        
        agentCounts[playerStats.character] = (agentCounts[playerStats.character] || 0) + 1;
        
        if (match.teams.red.has_won && playerStats.team === 'Red' ||
            match.teams.blue.has_won && playerStats.team === 'Blue') {
          wins++;
        }
      }
    });

    const mostPlayedAgent = Object.keys(agentCounts).reduce((a, b) => 
      agentCounts[a] > agentCounts[b] ? a : b, 'Unknown');

    return {
      averageScore: Math.round(totalScore / totalMatches),
      kdr: (totalKills / totalDeaths).toFixed(2),
      headShotPercentage: totalShots > 0 ? ((totalHeadshots / totalShots) * 100).toFixed(2) : 0,
      winRate: ((wins / totalMatches) * 100).toFixed(2),
      mostPlayedAgent,
      averageDamage: Math.round(totalDamage / totalMatches)
    };
  }

  // Enhanced skill assessment with multiple factors
  assessSkillLevelAdvanced(game, stats) {
    const config = this.supportedGames[game];
    let score = 0;

    switch (game) {
      case 'league_of_legends': {
        // Base score from rank
        const tier = stats.soloQueue.tier;
        const rank = stats.soloQueue.rank;
        const lp = stats.soloQueue.leaguePoints;
        
        if (config.skillMetrics[tier]) {
          score = config.skillMetrics[tier].min;
          
          // Add points for rank within tier
          if (rank === 'I') score += 75;
          else if (rank === 'II') score += 50;
          else if (rank === 'III') score += 25;
          
          // Add LP bonus
          score += Math.min(lp / 100 * 25, 25);
        }
        
        // Recent performance modifiers
        const winRate = parseFloat(stats.soloQueue.winRate);
        if (winRate > 60) score += 50;
        else if (winRate < 45) score -= 30;
        
        const recentKDA = stats.recentPerformance.averageKDA;
        if (recentKDA > 2.0) score += 30;
        else if (recentKDA < 1.0) score -= 20;
        
        break;
      }

      case 'valorant': {
        const currentTier = stats.currentRank.tier.split(' ')[0];
        if (config.skillMetrics[currentTier]) {
          score = config.skillMetrics[currentTier].min;
          score += stats.currentRank.rr / 100 * 100; // RR bonus
        }
        
        // Performance modifiers
        const valoKdr = parseFloat(stats.recentPerformance.kdr);
        if (valoKdr > 1.2) score += 40;
        else if (valoKdr < 0.8) score -= 30;
        
        const headShotPct = parseFloat(stats.recentPerformance.headShotPercentage);
        if (headShotPct > 25) score += 30;
        
        break;
      }

      case 'counter_strike': {
        const kdr = parseFloat(stats.combat.kdr);
        const winRate = parseFloat(stats.matches.winRate);
        
        // Base score from performance metrics
        if (kdr > 1.5 && winRate > 60) score = 1700; // Global Elite level
        else if (kdr > 1.2 && winRate > 55) score = 1400; // Supreme level
        else if (kdr > 1.0 && winRate > 50) score = 1100; // LE level
        else if (kdr > 0.8 && winRate > 45) score = 800; // MG level
        else if (kdr > 0.6) score = 500; // GN level
        else score = 200; // Silver level
        
        // Headshot and utility bonuses
        const hsPct = parseFloat(stats.combat.headShotPercentage);
        if (hsPct > 50) score += 100;
        else if (hsPct > 40) score += 50;
        
        if (stats.objectives.utilityScore > 100) score += 50;
        
        break;
      }
    }

    // Convert score to skill level
    if (score >= 1600) return 'Expert';
    if (score >= 1200) return 'Advanced';
    if (score >= 800) return 'Intermediate+';
    if (score >= 400) return 'Intermediate';
    if (score >= 100) return 'Beginner';
    return 'Novice';
  }

  // Rate limiting check
  async checkRateLimit(game, userId) {
    const key = `rate_limit_${game}_${userId}`;
    const now = Date.now();
    const config = this.supportedGames[game].rateLimit;
    
    // This would typically use Redis for distributed systems
    // For now, using in-memory storage
    const userRequests = this.rateLimitStore.get(key) || [];
    const windowStart = now - config.window;
    
    // Remove old requests
    const recentRequests = userRequests.filter(timestamp => timestamp > windowStart);
    
    if (recentRequests.length >= config.requests) {
      throw new AppError(`Rate limit exceeded for ${game}. Try again later.`, 429);
    }
    
    recentRequests.push(now);
    this.rateLimitStore.set(key, recentRequests);
  }

  validateGameAccountFormat(game, account) {
    const patterns = {
      'league_of_legends': /^[a-zA-Z0-9\s]{3,16}$/,
      'valorant': /^[a-zA-Z0-9\s]{3,16}#[a-zA-Z0-9]{3,5}$/,
      'counter_strike': /^\d{17}$/
    };
    
    if (!patterns[game].test(account)) {
      const formats = {
        'league_of_legends': 'Summoner Name (3-16 characters)',
        'valorant': 'Name#Tag (e.g., Player#1234)',
        'counter_strike': '17-digit Steam ID'
      };
      throw new AppError(`Invalid ${game} account format. Expected: ${formats[game]}`, 400);
    }
  }

  // Initialize rate limit storage
  rateLimitStore = new Map();
}

// Fraud Detection Service
class FraudDetectionService {
  async analyzeStats(game, gameAccount, stats, userId) {
    let riskScore = 0;
    const flags = [];

    // Check for impossible stats
    riskScore += this.checkImpossibleStats(game, stats, flags);
    
    // Check for stat inconsistencies
    riskScore += this.checkStatConsistency(game, stats, flags);
    
    // Check user behavior patterns
    riskScore += await this.checkUserBehavior(userId, game, flags);
    
    // Check account age vs stats
    riskScore += this.checkAccountCredibility(game, stats, flags);

    return Math.min(riskScore, 100); // Cap at 100
  }

  checkImpossibleStats(game, stats, flags) {
    let score = 0;

    switch (game) {
      case 'league_of_legends':
        // Check for impossible win rates
        const winRate = parseFloat(stats.soloQueue.winRate);
        if (winRate > 95 && stats.soloQueue.wins + stats.soloQueue.losses > 50) {
          score += 40;
          flags.push('Impossibly high win rate');
        }
        
        // Check KDA vs rank inconsistency
        const avgKDA = stats.recentPerformance.averageKDA;
        const tier = stats.soloQueue.tier;
        if (avgKDA > 4.0 && ['IRON', 'BRONZE'].includes(tier)) {
          score += 30;
          flags.push('KDA inconsistent with rank');
        }
        break;

      case 'valorant':
        const hsRate = parseFloat(stats.recentPerformance.headShotPercentage);
        if (hsRate > 60) {
          score += 35;
          flags.push('Unusually high headshot rate');
        }
        break;

      case 'counter_strike':
        const kdr = parseFloat(stats.combat.kdr);
        const hsPercent = parseFloat(stats.combat.headShotPercentage);
        if (kdr > 3.0 && hsPercent > 70) {
          score += 50;
          flags.push('Professional-level stats detected');
        }
        break;
    }

    return score;
  }

  checkStatConsistency(game, stats, flags) {
    // Implementation for checking internal stat consistency
    return 0;
  }

  async checkUserBehavior(userId, game, flags) {
    // Check verification frequency
    const recentVerifications = await db.Proof.count({
      where: {
        userId,
        submittedAt: {
          [db.Sequelize.Op.gte]: new Date(Date.now() - 24 * 60 * 60 * 1000)
        }
      }
    });

    return recentVerifications > 5 ? 20 : 0;
  }

  checkAccountCredibility(game, stats, flags) {
    let score = 0;

    switch (game) {
      case 'league_of_legends':
        if (stats.summonerLevel < 50 && stats.soloQueue.tier !== 'UNRANKED') {
          score += 25;
          flags.push('Low level account with ranked stats');
        }
        break;

      case 'valorant':
        if (stats.accountLevel < 20 && stats.currentRank.tier !== 'Unranked') {
          score += 25;
          flags.push('Low level account with competitive rank');
        }
        break;
    }

    return score;
  }
}

// Stats Comparison Service
class StatsComparator {
  compareStats(oldStats, newStats) {
    // Implementation for comparing stats over time
    const consistency = {
      score: 0.9, // Mock consistency score
      warnings: []
    };

    return consistency;
  }
}

// Email Service for notifications
class EmailService {
  async sendVerificationEmail(email, token) {
    // In production, integrate with SendGrid, AWS SES, etc.
    logger.info(`Verification email sent to: ${email}`);
    // Mock implementation
    return true;
  }

  async sendPasswordResetEmail(email, token) {
    logger.info(`Password reset email sent to: ${email}`);
    return true;
  }

  async sendSecurityAlert(email, alertType, details) {
    logger.info(`Security alert sent to: ${email}, type: ${alertType}`);
    return true;
  }
}

module.exports = {
  EnhancedGameService,
  FraudDetectionService,
  StatsComparator,
  EmailService
};