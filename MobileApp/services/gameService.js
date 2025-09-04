const db = require('../Models');
const axios = require('axios');
const crypto = require('crypto');

class GameService {
  constructor() {
    this.supportedGames = {
      'league_of_legends': {
        name: 'League of Legends',
        apiEndpoint: 'https://na1.api.riotgames.com',
        requiredStats: ['rank', 'winRate', 'kda'],
        apiKey: process.env.RIOT_API_KEY
      },
      'valorant': {
        name: 'Valorant',
        apiEndpoint: 'https://api.henrikdev.xyz/valorant',
        requiredStats: ['rank', 'winRate', 'averageScore'],
        apiKey: process.env.VALORANT_API_KEY
      },
      'counter_strike': {
        name: 'Counter-Strike 2',
        apiEndpoint: 'https://api.steampowered.com',
        requiredStats: ['rank', 'winRate', 'kdr'],
        apiKey: process.env.STEAM_API_KEY
      }
    };
  }

  getSupportedGames() {
    return Object.keys(this.supportedGames).map(key => ({
      id: key,
      name: this.supportedGames[key].name,
      requiredStats: this.supportedGames[key].requiredStats
    }));
  }

  async fetchPlayerStats(game, gameAccount) {
    const gameConfig = this.supportedGames[game];
    if (!gameConfig) {
      throw new Error(`Unsupported game: ${game}`);
    }

    try {
      let stats;
      switch (game) {
        case 'league_of_legends':
          stats = await this.fetchLeagueStats(gameAccount, gameConfig);
          break;
        case 'valorant':
          stats = await this.fetchValorantStats(gameAccount, gameConfig);
          break;
        case 'counter_strike':
          stats = await this.fetchCSStats(gameAccount, gameConfig);
          break;
        default:
          throw new Error(`No stats fetcher for ${game}`);
      }

      return {
        game,
        gameAccount,
        stats,
        fetchedAt: new Date(),
        source: gameConfig.apiEndpoint
      };
    } catch (error) {
      throw new Error(`Failed to fetch stats for ${game}: ${error.message}`);
    }
  }

  async fetchLeagueStats(summonerName, config) {
    const headers = { 'X-Riot-Token': config.apiKey };
    
    // Get summoner by name
    const summonerResponse = await axios.get(
      `${config.apiEndpoint}/lol/summoner/v4/summoners/by-name/${encodeURIComponent(summonerName)}`,
      { headers }
    );
    
    const summonerId = summonerResponse.data.id;
    
    // Get ranked stats
    const rankedResponse = await axios.get(
      `${config.apiEndpoint}/lol/league/v4/entries/by-summoner/${summonerId}`,
      { headers }
    );
    
    const soloQueue = rankedResponse.data.find(entry => entry.queueType === 'RANKED_SOLO_5x5');
    
    return {
      rank: soloQueue ? `${soloQueue.tier} ${soloQueue.rank}` : 'Unranked',
      winRate: soloQueue ? (soloQueue.wins / (soloQueue.wins + soloQueue.losses) * 100).toFixed(2) : 0,
      wins: soloQueue?.wins || 0,
      losses: soloQueue?.losses || 0,
      leaguePoints: soloQueue?.leaguePoints || 0
    };
  }

  async fetchValorantStats(playerTag, config) {
    // Parse player tag (Name#Tag)
    const [name, tag] = playerTag.split('#');
    
    const response = await axios.get(
      `${config.apiEndpoint}/v1/account/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`
    );
    
    const mmrResponse = await axios.get(
      `${config.apiEndpoint}/v2/mmr/na/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`
    );
    
    return {
      rank: mmrResponse.data.current_data.currenttierpatched || 'Unranked',
      rr: mmrResponse.data.current_data.ranking_in_tier || 0,
      peakRank: mmrResponse.data.highest_rank?.patched_tier || 'N/A'
    };
  }

  async fetchCSStats(steamId, config) {
    const response = await axios.get(
      `${config.apiEndpoint}/ISteamUserStats/GetUserStatsForGame/v0002/`,
      {
        params: {
          appid: 730, // CS2 app ID
          key: config.apiKey,
          steamid: steamId
        }
      }
    );
    
    const stats = response.data.playerstats.stats;
    const kills = stats.find(s => s.name === 'total_kills')?.value || 0;
    const deaths = stats.find(s => s.name === 'total_deaths')?.value || 1;
    const wins = stats.find(s => s.name === 'total_wins')?.value || 0;
    const rounds = stats.find(s => s.name === 'total_rounds_played')?.value || 0;
    
    return {
      kills,
      deaths,
      kdr: (kills / deaths).toFixed(2),
      wins,
      winRate: rounds > 0 ? ((wins / rounds) * 100).toFixed(2) : 0
    };
  }

  async storeVerification(userId, questId, gameAccount, apiSource, statsFetched, verificationData) {
    const verificationHash = crypto
      .createHash('sha256')
      .update(JSON.stringify({ userId, questId, gameAccount, statsFetched, timestamp: Date.now() }))
      .digest('hex');

    const proof = await db.Proof.create({
      userId,
      questId,
      gameAccount,
      apiSource,
      statFetched: statsFetched,
      verificationHash,
      verified: verificationData.verified || true,
      submittedAt: new Date()
    });

    return proof;
  }

  async getUserVerifications(userId) {
    const proofs = await db.Proof.findAll({
      where: { userId },
      include: [
        {
          model: db.Quest,
          attributes: ['title', 'description']
        }
      ],
      order: [['submittedAt', 'DESC']]
    });

    return proofs;
  }

  // Skill assessment based on stats
  assessSkillLevel(game, stats) {
    switch (game) {
      case 'league_of_legends':
        return this.assessLeagueSkill(stats);
      case 'valorant':
        return this.assessValorantSkill(stats);
      case 'counter_strike':
        return this.assessCSSkill(stats);
      default:
        return 'Unknown';
    }
  }

  assessLeagueSkill(stats) {
    const rank = stats.rank.toLowerCase();
    const winRate = parseFloat(stats.winRate);
    
    if (rank.includes('challenger') || rank.includes('grandmaster')) {
      return 'Expert';
    } else if (rank.includes('master') || rank.includes('diamond')) {
      return 'Advanced';
    } else if (rank.includes('platinum') || rank.includes('gold')) {
      return winRate > 60 ? 'Intermediate+' : 'Intermediate';
    } else if (rank.includes('silver') || rank.includes('bronze')) {
      return 'Beginner';
    } else {
      return 'Unranked';
    }
  }

  assessValorantSkill(stats) {
    const rank = stats.rank.toLowerCase();
    
    if (rank.includes('radiant') || rank.includes('immortal')) {
      return 'Expert';
    } else if (rank.includes('diamond') || rank.includes('ascendant')) {
      return 'Advanced';
    } else if (rank.includes('platinum') || rank.includes('gold')) {
      return 'Intermediate';
    } else if (rank.includes('silver') || rank.includes('bronze')) {
      return 'Beginner';
    } else {
      return 'Unranked';
    }
  }

  assessCSSkill(stats) {
    const kdr = parseFloat(stats.kdr);
    const winRate = parseFloat(stats.winRate);
    
    if (kdr > 1.5 && winRate > 70) {
      return 'Expert';
    } else if (kdr > 1.2 && winRate > 60) {
      return 'Advanced';
    } else if (kdr > 1.0 && winRate > 50) {
      return 'Intermediate';
    } else {
      return 'Beginner';
    }
  }
}

module.exports = new GameService();