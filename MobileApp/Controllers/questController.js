const { catchAsync, AppError } = require('../utils/errorHandler');
const { auditLogger, logger } = require('../utils/logger');
const db = require('../Models');
const { Op } = require('sequelize');

class QuestController {
  // Get all worlds with their quests
  getAllWorlds = catchAsync(async (req, res) => {
    const { includeStats = false } = req.query;

    const includeOptions = [
      {
        model: db.Quest,
        include: [{ model: db.Reward }]
      }
    ];

    if (includeStats === 'true') {
      includeOptions.push({
        model: db.Leaderboard,
        attributes: ['userId', 'score'],
        include: [{ model: db.User, attributes: ['username'] }],
        limit: 5,
        order: [['score', 'DESC']]
      });
    }

    const worlds = await db.World.findAll({
      include: includeOptions,
      order: [
        ['worldId', 'ASC'],
        [db.Quest, 'questId', 'ASC']
      ]
    });

    // Add completion statistics for each world
    const worldsWithStats = await Promise.all(
      worlds.map(async (world) => {
        const totalQuests = world.Quests.length;
        const completedQuests = await db.Progress.count({
          where: { status: 'verified' },
          include: [{
            model: db.Quest,
            where: { worldId: world.worldId },
            attributes: []
          }]
        });

        return {
          ...world.toJSON(),
          stats: {
            totalQuests,
            completedQuests,
            completionRate: totalQuests > 0 ? ((completedQuests / totalQuests) * 100).toFixed(1) : 0
          }
        };
      })
    );

    res.json({
      success: true,
      data: {
        worlds: worldsWithStats,
        totalWorlds: worlds.length
      }
    });
  });

  // Get quests by world ID
  getQuestsByWorld = catchAsync(async (req, res, next) => {
    const { worldId } = req.params;
    const { includeProgress = false } = req.query;

    const world = await db.World.findByPk(worldId);
    if (!world) {
      return next(new AppError('World not found', 404));
    }

    const includeOptions = [{ model: db.Reward }];
    
    if (includeProgress === 'true' && req.user) {
      includeOptions.push({
        model: db.Progress,
        where: { userId: req.user.userId },
        required: false
      });
    }

    const quests = await db.Quest.findAll({
      where: { worldId },
      include: includeOptions,
      order: [['questId', 'ASC']]
    });

    // Add completion statistics
    const questsWithStats = await Promise.all(
      quests.map(async (quest) => {
        const totalAttempts = await db.Progress.count({
          where: { questId: quest.questId }
        });
        
        const completedAttempts = await db.Progress.count({
          where: { 
            questId: quest.questId,
            status: 'verified'
          }
        });

        return {
          ...quest.toJSON(),
          stats: {
            totalAttempts,
            completedAttempts,
            completionRate: totalAttempts > 0 ? ((completedAttempts / totalAttempts) * 100).toFixed(1) : 0
          }
        };
      })
    );

    res.json({
      success: true,
      data: {
        world: world.toJSON(),
        quests: questsWithStats
      }
    });
  });

  // Get user's quest progress
  getUserProgress = catchAsync(async (req, res, next) => {
    const { userId } = req.params;

    // Authorization check
    if (req.user.userId !== parseInt(userId) && req.user.role !== 'admin') {
      return next(new AppError('Access denied', 403));
    }

    const progress = await db.Progress.findAll({
      where: { userId },
      include: [
        {
          model: db.Quest,
          include: [
            { model: db.World, attributes: ['worldId', 'name'] },
            { model: db.Reward, attributes: ['rewardId', 'name', 'type', 'imageUrl'] }
          ]
        }
      ],
      order: [['completedAt', 'DESC']]
    });

    // Group progress by world
    const progressByWorld = progress.reduce((acc, prog) => {
      const worldId = prog.Quest.worldId;
      if (!acc[worldId]) {
        acc[worldId] = {
          world: prog.Quest.World,
          quests: [],
          stats: {
            total: 0,
            completed: 0,
            inProgress: 0,
            notStarted: 0,
            totalScore: 0
          }
        };
      }
      
      acc[worldId].quests.push(prog);
      acc[worldId].stats.total++;
      acc[worldId].stats.totalScore += prog.score;
      
      switch (prog.status) {
        case 'verified':
          acc[worldId].stats.completed++;
          break;
        case 'in_progress':
          acc[worldId].stats.inProgress++;
          break;
        default:
          acc[worldId].stats.notStarted++;
      }
      
      return acc;
    }, {});

    // Calculate overall statistics
    const overallStats = {
      totalQuests: progress.length,
      completedQuests: progress.filter(p => p.status === 'verified').length,
      inProgressQuests: progress.filter(p => p.status === 'in_progress').length,
      totalScore: progress.reduce((sum, p) => sum + p.score, 0)
    };

    res.json({
      success: true,
      data: {
        userId: parseInt(userId),
        overallStats,
        progressByWorld: Object.values(progressByWorld)
      }
    });
  });

  // Start a quest
  startQuest = catchAsync(async (req, res, next) => {
    const { questId } = req.body;
    const userId = req.user.userId;

    // Check if quest exists
    const quest = await db.Quest.findByPk(questId, {
      include: [{ model: db.World, attributes: ['name'] }]
    });
    
    if (!quest) {
      return next(new AppError('Quest not found', 404));
    }

    // Check if user already has progress for this quest
    const existingProgress = await db.Progress.findOne({
      where: { userId, questId }
    });

    if (existingProgress) {
      if (existingProgress.status === 'verified') {
        return next(new AppError('Quest already completed', 400));
      } else {
        return next(new AppError('Quest already in progress', 400));
      }
    }

    const progress = await db.Progress.create({
      userId,
      questId,
      status: 'in_progress'
    });

    auditLogger.info('Quest started', {
      userId,
      questId,
      questTitle: quest.title,
      worldName: quest.World.name
    });

    res.status(201).json({
      success: true,
      message: 'Quest started successfully',
      data: {
        progress: {
          ...progress.toJSON(),
          quest: {
            questId: quest.questId,
            title: quest.title,
            description: quest.description,
            world: quest.World
          }
        }
      }
    });
  });

  // Complete a quest (manual completion for non-verification quests)
  completeQuest = catchAsync(async (req, res, next) => {
    const { questId, score = 0 } = req.body;
    const userId = req.user.userId;

    const progress = await db.Progress.findOne({
      where: { userId, questId },
      include: [{
        model: db.Quest,
        include: [{ model: db.World }]
      }]
    });

    if (!progress) {
      return next(new AppError('Quest not started. Please start the quest first.', 404));
    }

    if (progress.status === 'verified') {
      return next(new AppError('Quest already completed', 400));
    }

    // Check if this quest requires proof verification
    if (progress.Quest.proofRequired) {
      return next(new AppError('This quest requires verification proof. Please use the verification endpoint.', 400));
    }

    await progress.update({
      status: 'completed',
      completedAt: new Date(),
      score: Math.max(progress.score, score)
    });

    // Update leaderboard
    await this.updateLeaderboard(userId, progress.Quest.worldId, score);

    auditLogger.info('Quest completed', {
      userId,
      questId,
      questTitle: progress.Quest.title,
      score,
      completedAt: progress.completedAt
    });

    res.json({
      success: true,
      message: 'Quest completed successfully',
      data: {
        progress: progress.toJSON(),
        scoreEarned: score
      }
    });
  });

  // Abandon a quest
  abandonQuest = catchAsync(async (req, res, next) => {
    const { questId } = req.body;
    const userId = req.user.userId;

    const progress = await db.Progress.findOne({
      where: { userId, questId },
      include: [{ model: db.Quest, attributes: ['title'] }]
    });

    if (!progress) {
      return next(new AppError('Quest progress not found', 404));
    }

    if (progress.status === 'verified') {
      return next(new AppError('Cannot abandon a completed quest', 400));
    }

    await progress.destroy();

    auditLogger.info('Quest abandoned', {
      userId,
      questId,
      questTitle: progress.Quest.title,
      previousStatus: progress.status
    });

    res.json({
      success: true,
      message: 'Quest abandoned successfully'
    });
  });

  // Get quest leaderboard
  getQuestLeaderboard = catchAsync(async (req, res, next) => {
    const { questId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const quest = await db.Quest.findByPk(questId, {
      attributes: ['questId', 'title', 'description']
    });

    if (!quest) {
      return next(new AppError('Quest not found', 404));
    }

    const leaderboard = await db.Progress.findAll({
      where: {
        questId,
        status: 'verified'
      },
      include: [{
        model: db.User,
        attributes: ['userId', 'username']
      }],
      order: [['score', 'DESC'], ['completedAt', 'ASC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    const rankedLeaderboard = leaderboard.map((entry, index) => ({
      rank: parseInt(offset) + index + 1,
      user: entry.User,
      score: entry.score,
      completedAt: entry.completedAt
    }));

    res.json({
      success: true,
      data: {
        quest: quest.toJSON(),
        leaderboard: rankedLeaderboard,
        totalEntries: leaderboard.length
      }
    });
  });

  // Helper method to update leaderboard
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
}

module.exports = new QuestController();