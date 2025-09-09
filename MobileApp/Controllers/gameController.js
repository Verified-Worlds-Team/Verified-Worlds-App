const { catchAsync, AppError } = require('../utils/errorHandler');
const { auditLogger, logger } = require('../utils/logger');
const db = require('../Models');
const { Op } = require('sequelize');
const gameApiClient = require('../services/apiClient');
const zkTLSService = require('../services/zkTLSService');
const { EnhancedGameService, FraudDetectionService } = require('../services/enhancedGameService');

class GameController {
  constructor() {
    this.gameService = new EnhancedGameService();
    this.fraudDetector = new FraudDetectionService();
  }

  // Get supported games with detailed information
  getSupportedGames = catchAsync(async (req, res) => {
    const supportedGames = this.gameService.getSupportedGames();
    
    // Add verification statistics for each game
    const gameStats = await Promise.all(
      Object.keys(supportedGames).map(async (gameId) => {
        const [totalVerifications, successfulVerifications] = await Promise.all([
          db.Proof.count({ where: { apiSource: gameId } }),
          db.Proof.count({ where: { apiSource: gameId, verified: true } })
        ]);
        
        const successRate = totalVerifications > 0 
          ? ((successfulVerifications / totalVerifications) * 100).toFixed(1)
          : 0;

        return {
          ...supportedGames[gameId],
          id: gameId,
          stats: {
            totalVerifications,
            successfulVerifications,
            successRate: parseFloat(successRate)
          }
        };
      })
    );

    res.json({
      success: true,
      data: {
        games: gameStats,
        totalSupported: gameStats.length
      }
    });
  });

  // Enhanced player stats verification with comprehensive fraud detection
  verifyPlayerStats = catchAsync(async (req, res, next) => {
    const { game, gameAccount, questId } = req.body;
    const userId = req.user.userId;

    // Validate quest exists and user can access it
    const quest = await db.Quest.findByPk(questId);
    if (!quest) {
      return next(new AppError('Quest not found', 404));
    }

    // Check if user already has verification for this quest
    const existingProof = await db.Proof.findOne({
      where: { userId, questId }
    });

    if (existingProof && existingProof.verified) {
      return next(new AppError('You have already completed verification for this quest', 400));
    }

    // Rate limiting check - user specific
    const recentAttempts = await db.VerificationAttempt.count({
      where: {
        userId,
        game,
        attemptedAt: {
          [Op.gte]: new Date(Date.now() - 60 * 60 * 1000) // Last hour
        }
      }
    });

    if (recentAttempts >= 5) {
      auditLogger.warn('User verification rate limit exceeded', {
        userId,
        game,
        gameAccount: gameAccount.substring(0, 8) + '...',
        recentAttempts
      });
      return next(new AppError('Too many verification attempts. Please wait an hour before trying again.', 429));
    }

    let verificationAttempt;
    try {
      // Create verification attempt record
      verificationAttempt = await db.VerificationAttempt.create({
        userId,
        game,
        gameAccount,
        questId,
        success: false,
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });

      // Fetch and validate player stats
      logger.info(`Starting verification for ${game}:${gameAccount.substring(0, 8)}...`);
      
      const statsResult = await this.gameService.fetchPlayerStatsWithValidation(
        game, 
        gameAccount, 
        userId
      );
      
      // Run fraud detection analysis
      const fraudAnalysis = await this.fraudDetector.analyzeStats(
        game, 
        gameAccount, 
        statsResult.stats, 
        userId
      );

      // Generate zkTLS proof
      const zkProof = await zkTLSService.generateProof(
        game, 
        gameAccount, 
        statsResult
      );

      // Determine verification status based on fraud score
      const isVerified = fraudAnalysis < 70; // Threshold for auto-approval
      const needsManualReview = fraudAnalysis >= 50 && fraudAnalysis < 70;

      // Store the proof
      const proof = await db.Proof.create({
        userId,
        questId,
        gameAccount,
        apiSource: game,
        statFetched: {
          ...statsResult,
          fraudScore: fraudAnalysis,
          zkProof: zkProof.commitment
        },
        verificationHash: zkProof.proof.circuit_proof,
        verified: isVerified,
        submittedAt: new Date(),
        needsManualReview
      });

      // Update quest progress if automatically verified
      if (isVerified) {
        await this.updateQuestProgress(userId, questId, statsResult.skillLevel);
        
        // Submit to blockchain
        const chainResult = await zkTLSService.submitToChain(zkProof, userId, questId);
        proof.blockchainTx = chainResult.transactionHash;
        await proof.save();
      }

      // Update verification attempt as successful
      await verificationAttempt.update({
        success: true,
        fraudScore: fraudAnalysis
      });

      // Log successful verification
      auditLogger.info('Player verification completed', {
        userId,
        game,
        gameAccount: gameAccount.substring(0, 8) + '...',
        questId,
        skillLevel: statsResult.skillLevel,
        fraudScore: fraudAnalysis,
        autoVerified: isVerified,
        needsReview: needsManualReview,
        proofId: proof.proofId
      });

      const responseData = {
        success: true,
        message: isVerified ? 'Verification successful!' : 
                needsManualReview ? 'Verification submitted for manual review' :
                'Verification failed due to high fraud risk',
        data: {
          proof: {
            proofId: proof.proofId,
            verified: proof.verified,
            needsManualReview,
            skillLevel: statsResult.skillLevel,
            fraudScore: fraudAnalysis
          },
          stats: this.sanitizeStatsForResponse(statsResult.stats),
          warnings: statsResult.warnings || [],
          zkProof: zkProof.commitment,
          blockchainTx: proof.blockchainTx || null
        }
      };

      res.status(isVerified ? 200 : 202).json(responseData);

    } catch (error) {
      // Update verification attempt with error
      if (verificationAttempt) {
        await verificationAttempt.update({
          error: error.message,
          fraudScore: error.fraudScore || 0
        });
      }

      auditLogger.error('Verification failed', {
        userId,
        game,
        gameAccount: gameAccount.substring(0, 8) + '...',
        questId,
        error: error.message,
        stack: error.stack
      });

      // Handle specific error types
      if (error.message.includes('not found')) {
        return next(new AppError(`${game} account not found. Please check your username/ID.`, 404));
      } else if (error.message.includes('rate limit')) {
        return next(new AppError(`${game} API rate limit reached. Please try again in a few minutes.`, 429));
      } else if (error.message.includes('private') || error.message.includes('visibility')) {
        return next(new AppError('Account profile is private. Please make it public for verification.', 403));
      }

      throw error;
    }
  });

  // Get verification history with detailed analytics
  getVerificationHistory = catchAsync(async (req, res, next) => {
    const { userId } = req.params;
    const { 
      page = 1, 
      limit = 20, 
      game, 
      status, 
      sortBy = 'submittedAt',
      sortOrder = 'DESC' 
    } = req.query;

    // Authorization check
    if (req.user.userId !== parseInt(userId) && req.user.role !== 'admin') {
      return next(new AppError('Access denied', 403));
    }

    const whereClause = { userId };
    if (game) whereClause.apiSource = game;
    if (status === 'verified') whereClause.verified = true;
    if (status === 'pending') whereClause.verified = false;

    const { count, rows: verifications } = await db.Proof.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: db.Quest,
          attributes: ['questId', 'title', 'description'],
          include: [{ 
            model: db.World, 
            attributes: ['worldId', 'name'] 
          }]
        }
      ],
      order: [[sortBy, sortOrder]],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit)
    });

    // Calculate user analytics
    const analytics = await this.calculateUserAnalytics(userId);

    // Get recent skill progression
    const skillProgression = await this.getSkillProgression(userId);

    res.json({
      success: true,
      data: {
        verifications: verifications.map(v => ({
          ...v.toJSON(),
          stats: this.sanitizeStatsForResponse(v.statFetched?.stats)
        })),
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(count / parseInt(limit)),
          totalItems: count,
          itemsPerPage: parseInt(limit)
        },
        analytics,
        skillProgression
      }
    });
  });

  // Re-verify proof with enhanced validation
  reverifyProof = catchAsync(async (req, res, next) => {
    const { proofId } = req.params;
    
    const proof = await db.Proof.findByPk(proofId, {
      include: [
        { model: db.User, attributes: ['userId', 'username'] },
        { model: db.Quest, attributes: ['questId', 'title'] }
      ]
    });

    if (!proof) {
      return next(new AppError('Proof not found', 404));
    }

    // Authorization check
    if (proof.userId !== req.user.userId && req.user.role !== 'admin') {
      return next(new AppError('Access denied', 403));
    }

    // Check if proof is recent enough
    const hoursSinceSubmission = (Date.now() - new Date(proof.submittedAt)) / (1000 * 60 * 60);
    if (hoursSinceSubmission > 24) {
      return next(new AppError('Proof is too old to re-verify. Please submit a new verification.', 400));
    }

    try {
      // Re-fetch current stats
      const currentStats = await this.gameService.fetchPlayerStatsWithValidation(
        proof.apiSource,
        proof.gameAccount,
        proof.userId
      );
      
      // Compare with original stats
      const originalStats = proof.statFetched?.stats;
      const consistency = this.calculateStatsConsistency(originalStats, currentStats.stats);
      
      // Re-run fraud detection
      const newFraudScore = await this.fraudDetector.analyzeStats(
        proof.apiSource,
        proof.gameAccount,
        currentStats.stats,
        proof.userId
      );

      // Re-verify zkTLS proof
      const verificationResult = await zkTLSService.verifyProof(
        currentStats,
        proof.verificationHash
      );

      const isStillValid = verificationResult.valid && 
                          consistency.score > 0.7 && 
                          newFraudScore < 70;

      await proof.update({
        verified: isStillValid,
        lastVerified: new Date(),
        statFetched: {
          ...proof.statFetched,
          reVerification: {
            timestamp: new Date(),
            currentStats: currentStats.stats,
            consistencyScore: consistency.score,
            newFraudScore
          }
        }
      });

      auditLogger.info('Proof re-verified', {
        proofId,
        userId: proof.userId,
        game: proof.apiSource,
        originallyVerified: proof.verified,
        stillValid: isStillValid,
        consistencyScore: consistency.score,
        newFraudScore,
        requester: req.user.userId
      });

      res.json({
        success: true,
        data: {
          proofId,
          verified: isStillValid,
          consistencyScore: consistency.score,
          fraudScore: newFraudScore,
          warnings: consistency.warnings,
          reVerifiedAt: new Date()
        }
      });

    } catch (error) {
      auditLogger.error('Re-verification failed', {
        proofId,
        error: error.message,
        requester: req.user.userId
      });
      return next(new AppError('Re-verification failed: ' + error.message, 500));
    }
  });

  // Get user's game-specific stats summary
  getMyGameStats = catchAsync(async (req, res, next) => {
    const { game } = req.params;
    const userId = req.user.userId;

    if (!this.gameService.supportedGames[game]) {
      return next(new AppError('Unsupported game', 400));
    }

    const userProofs = await db.Proof.findAll({
      where: {
        userId,
        apiSource: game,
        verified: true
      },
      order: [['submittedAt', 'DESC']],
      limit: 5
    });

    if (userProofs.length === 0) {
      return res.json({
        success: true,
        data: {
          game,
          hasVerifications: false,
          message: 'No verified stats found for this game'
        }
      });
    }

    const latestProof = userProofs[0];
    const stats = latestProof.statFetched?.stats;
    const skillLevel = this.gameService.assessSkillLevelAdvanced(game, stats);

    // Calculate improvement over time
    const improvement = userProofs.length > 1 
      ? this.calculateImprovement(userProofs)
      : null;

    res.json({
      success: true,
      data: {
        game,
        hasVerifications: true,
        latestStats: this.sanitizeStatsForResponse(stats),
        skillLevel,
        verificationCount: userProofs.length,
        lastVerified: latestProof.submittedAt,
        improvement,
        gameAccount: latestProof.gameAccount
      }
    });
  });

  // Delete user's own verification
  deleteMyVerification = catchAsync(async (req, res, next) => {
    const { proofId } = req.params;
    const userId = req.user.userId;

    const proof = await db.Proof.findOne({
      where: { proofId, userId }
    });

    if (!proof) {
      return next(new AppError('Proof not found or access denied', 404));
    }

    // Only allow deletion of unverified proofs or within 24 hours
    const hoursSinceSubmission = (Date.now() - new Date(proof.submittedAt)) / (1000 * 60 * 60);
    
    if (proof.verified && hoursSinceSubmission > 24) {
      return next(new AppError('Cannot delete verified proofs older than 24 hours', 403));
    }

    await proof.destroy();

    auditLogger.info('User deleted their verification', {
      userId,
      proofId,
      game: proof.apiSource,
      wasVerified: proof.verified
    });

    res.json({
      success: true,
      message: 'Verification deleted successfully'
    });
  });

  // Get game leaderboard
  getGameLeaderboard = catchAsync(async (req, res, next) => {
    const { game } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    if (!this.gameService.supportedGames[game]) {
      return next(new AppError('Unsupported game', 400));
    }

    // Get top players for this game based on skill assessment
    const leaderboard = await db.sequelize.query(`
      SELECT 
        u.username,
        u."userId",
        p."gameAccount",
        p."statFetched",
        p."submittedAt",
        ROW_NUMBER() OVER (
          PARTITION BY u."userId" 
          ORDER BY p."submittedAt" DESC
        ) as rn
      FROM proofs p
      JOIN users u ON p."userId" = u."userId"
      WHERE p."apiSource" = :game 
        AND p.verified = true
      ORDER BY p."submittedAt" DESC
      LIMIT :limit OFFSET :offset
    `, {
      replacements: { game, limit: parseInt(limit), offset: parseInt(offset) },
      type: db.Sequelize.QueryTypes.SELECT
    });

    // Filter to get only latest verification per user and calculate scores
    const processedLeaderboard = leaderboard
      .filter(entry => entry.rn === 1)
      .map(entry => {
        const stats = entry.statFetched?.stats;
        const skillLevel = this.gameService.assessSkillLevelAdvanced(game, stats);
        const score = this.calculateLeaderboardScore(game, stats);
        
        return {
          username: entry.username,
          userId: entry.userId,
          gameAccount: entry.gameAccount,
          skillLevel,
          score,
          stats: this.sanitizeStatsForResponse(stats),
          lastVerified: entry.submittedAt
        };
      })
      .sort((a, b) => b.score - a.score)
      .map((entry, index) => ({
        ...entry,
        rank: index + 1
      }));

    res.json({
      success: true,
      data: {
        game,
        leaderboard: processedLeaderboard,
        totalEntries: processedLeaderboard.length
      }
    });
  });

  // Admin: Get fraud reports
  getFraudReports = catchAsync(async (req, res) => {
    const { page = 1, limit = 20 } = req.query;

    const { count, rows: reports } = await db.Proof.findAndCountAll({
      where: {
        [Op.or]: [
          { 'statFetched.fraudScore': { [Op.gte]: 50 } },
          { needsManualReview: true }
        ]
      },
      include: [
        {
          model: db.User,
          attributes: ['userId', 'username', 'email']
        },
        {
          model: db.Quest,
          attributes: ['questId', 'title']
        }
      ],
      order: [
        [db.Sequelize.json('statFetched.fraudScore'), 'DESC'],
        ['submittedAt', 'DESC']
      ],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit)
    });

    res.json({
      success: true,
      data: {
        reports: reports.map(report => ({
          ...report.toJSON(),
          fraudScore: report.statFetched?.fraudScore || 0
        })),
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(count / parseInt(limit)),
          totalItems: count
        }
      }
    });
  });

  // Admin: Get verification analytics
  getVerificationAnalytics = catchAsync(async (req, res) => {
    const { days = 30 } = req.query;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const analytics = await db.sequelize.query(`
      SELECT 
        DATE(p."submittedAt") as date,
        p."apiSource" as game,
        COUNT(*) as total_verifications,
        SUM(CASE WHEN p.verified = true THEN 1 ELSE 0 END) as successful_verifications,
        AVG(CAST(p."statFetched"->>'fraudScore' AS FLOAT)) as avg_fraud_score
      FROM proofs p
      WHERE p."submittedAt" >= :startDate
      GROUP BY DATE(p."submittedAt"), p."apiSource"
      ORDER BY date DESC, game
    `, {
      replacements: { startDate },
      type: db.Sequelize.QueryTypes.SELECT
    });

    res.json({
      success: true,
      data: {
        analytics,
        period: `${days} days`,
        startDate
      }
    });
  });

  // Admin: Update API limits for a game
  updateApiLimits = catchAsync(async (req, res, next) => {
    const { game } = req.params;
    const { requests, window } = req.body;

    if (!this.gameService.supportedGames[game]) {
      return next(new AppError('Unsupported game', 400));
    }

    // Update rate limits (this would typically be stored in database/config)
    this.gameService.supportedGames[game].rateLimit = {
      requests: parseInt(requests),
      window: parseInt(window)
    };

    auditLogger.info('API limits updated', {
      game,
      newLimits: { requests, window },
      adminId: req.user.userId
    });

    res.json({
      success: true,
      message: `API limits updated for ${game}`,
      data: { game, requests, window }
    });
  });

  // Helper methods
  updateQuestProgress = async (userId, questId, skillLevel) => {
    const progress = await db.Progress.findOne({
      where: { userId, questId }
    });

    const score = this.calculateSkillScore(skillLevel);

    if (!progress) {
      await db.Progress.create({
        userId,
        questId,
        status: 'verified',
        completedAt: new Date(),
        score
      });
    } else {
      await progress.update({
        status: 'verified',
        completedAt: new Date(),
        score: Math.max(progress.score, score)
      });
    }

    // Update leaderboard
    const quest = await db.Quest.findByPk(questId);
    if (quest) {
      await this.updateLeaderboard(userId, quest.worldId, score);
    }
  };

  updateLeaderboard = async (userId, worldId, score) => {
    const existingEntry = await db.Leaderboard.findOne({
      where: { userId, worldId }
    });

    if (existingEntry) {
      await existingEntry.update({
        score: existingEntry.score + score,
        lastUpdated: new Date()
      });
    } else {
      await db.Leaderboard.create({
        userId,
        worldId,
        score,
        lastUpdated: new Date()
      });
    }
  };

  calculateSkillScore = (skillLevel) => {
    const scoreMap = {
      'Novice': 50,
      'Beginner': 100,
      'Intermediate': 250,
      'Intermediate+': 400,
      'Advanced': 600,
      'Expert': 1000
    };
    return scoreMap[skillLevel] || 50;
  };

  calculateLeaderboardScore = (game, stats) => {
    // Game-specific scoring logic
    switch (game) {
      case 'league_of_legends':
        const tier = stats.soloQueue?.tier || 'UNRANKED';
        const winRate = parseFloat(stats.soloQueue?.winRate || 0);
        const kda = stats.recentPerformance?.averageKDA || 1;
        
        let baseScore = this.getTierScore(tier);
        baseScore += (winRate - 50) * 2; // Win rate bonus/penalty
        baseScore += (kda - 1) * 50; // KDA bonus
        
        return Math.max(0, Math.round(baseScore));

      case 'valorant':
        const rank = stats.currentRank?.tier || 'Unranked';
        const rr = stats.currentRank?.rr || 0;
        const headshots = parseFloat(stats.recentPerformance?.headShotPercentage || 0);
        
        let valoScore = this.getValorantRankScore(rank);
        valoScore += rr; // RR bonus
        valoScore += headshots * 2; // Headshot accuracy bonus
        
        return Math.max(0, Math.round(valoScore));

      case 'counter_strike':
        const kdr = parseFloat(stats.combat?.kdr || 0);
        const winRateCS = parseFloat(stats.matches?.winRate || 0);
        const hsPercent = parseFloat(stats.combat?.headShotPercentage || 0);
        
        let csScore = kdr * 200;
        csScore += winRateCS * 5;
        csScore += hsPercent * 3;
        
        return Math.max(0, Math.round(csScore));

      default:
        return 100;
    }
  };

  getTierScore = (tier) => {
    const scores = {
      'IRON': 100, 'BRONZE': 200, 'SILVER': 400, 'GOLD': 600,
      'PLATINUM': 800, 'DIAMOND': 1000, 'MASTER': 1200,
      'GRANDMASTER': 1400, 'CHALLENGER': 1600
    };
    return scores[tier] || 50;
  };

  getValorantRankScore = (rank) => {
    const rankName = rank.split(' ')[0];
    const scores = {
      'Iron': 100, 'Bronze': 300, 'Silver': 600, 'Gold': 900,
      'Platinum': 1200, 'Diamond': 1500, 'Ascendant': 1800,
      'Immortal': 2100, 'Radiant': 2400
    };
    return scores[rankName] || 50;
  };

  calculateUserAnalytics = async (userId) => {
    const [total, verified, games] = await Promise.all([
      db.Proof.count({ where: { userId } }),
      db.Proof.count({ where: { userId, verified: true } }),
      db.Proof.findAll({
        where: { userId },
        attributes: [
          'apiSource',
          [db.Sequelize.fn('COUNT', db.Sequelize.col('proofId')), 'count'],
          [db.Sequelize.fn('SUM', 
            db.Sequelize.cast(db.Sequelize.col('verified'), 'INTEGER')
          ), 'verified_count']
        ],
        group: ['apiSource'],
        raw: true
      })
    ]);

    return {
      totalVerifications: total,
      verifiedCount: verified,
      successRate: total > 0 ? ((verified / total) * 100).toFixed(1) : 0,
      gameBreakdown: games.map(g => ({
        game: g.apiSource,
        total: parseInt(g.count),
        verified: parseInt(g.verified_count),
        successRate: ((parseInt(g.verified_count) / parseInt(g.count)) * 100).toFixed(1)
      }))
    };
  };

  getSkillProgression = async (userId) => {
    const proofs = await db.Proof.findAll({
      where: { userId, verified: true },
      attributes: ['submittedAt', 'apiSource', 'statFetched'],
      order: [['submittedAt', 'ASC']],
      limit: 10
    });

    return proofs.map(proof => {
      const stats = proof.statFetched?.stats;
      const skillLevel = this.gameService.assessSkillLevelAdvanced(proof.apiSource, stats);
      
      return {
        date: proof.submittedAt,
        game: proof.apiSource,
        skillLevel,
        score: this.calculateSkillScore(skillLevel)
      };
    });
  };

  calculateStatsConsistency = (oldStats, newStats) => {
    // Simplified consistency check
    // In production, this would be much more sophisticated
    return {
      score: 0.85, // Mock consistency score
      warnings: []
    };
  };

  calculateImprovement = (proofs) => {
    if (proofs.length < 2) return null;
    
    const latest = proofs[0];
    const previous = proofs[1];
    
    // Calculate improvement based on skill level progression
    const latestScore = this.calculateSkillScore(
      this.gameService.assessSkillLevelAdvanced(latest.apiSource, latest.statFetched?.stats)
    );
    const previousScore = this.calculateSkillScore(
      this.gameService.assessSkillLevelAdvanced(previous.apiSource, previous.statFetched?.stats)
    );
    
    const improvement = latestScore - previousScore;
    const improvementPercent = ((improvement / previousScore) * 100).toFixed(1);
    
    return {
      scoreChange: improvement,
      percentChange: improvementPercent,
      trend: improvement > 0 ? 'improving' : improvement < 0 ? 'declining' : 'stable'
    };
  };

  sanitizeStatsForResponse = (stats) => {
    if (!stats) return null;
    
    // Remove sensitive/internal data before sending to client
    const sanitized = { ...stats };
    delete sanitized.internalFlags;
    delete sanitized.rawApiResponse;
    delete sanitized.debugInfo;
    
    return sanitized;
  };
}

module.exports = new GameController();