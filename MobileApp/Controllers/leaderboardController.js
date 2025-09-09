const { catchAsync, AppError } = require('../utils/errorHandler');
const db = require('../Models');
const { Op } = require('sequelize');

class LeaderboardController {
  // Get world leaderboard
  getWorldLeaderboard = catchAsync(async (req, res, next) => {
    const { worldId } = req.params;
    const { limit = 50, offset = 0, period = 'all' } = req.query;

    const world = await db.World.findByPk(worldId, {
      attributes: ['worldId', 'name', 'description']
    });

    if (!world) {
      return next(new AppError('World not found', 404));
    }

    // Build date filter for period
    let dateFilter = {};
    if (period !== 'all') {
      const now = new Date();
      switch (period) {
        case 'week':
          dateFilter.lastUpdated = { [Op.gte]: new Date(now - 7 * 24 * 60 * 60 * 1000) };
          break;
        case 'month':
          dateFilter.lastUpdated = { [Op.gte]: new Date(now - 30 * 24 * 60 * 60 * 1000) };
          break;
        case 'year':
          dateFilter.lastUpdated = { [Op.gte]: new Date(now - 365 * 24 * 60 * 60 * 1000) };
          break;
      }
    }

    const leaderboard = await db.Leaderboard.findAll({
      where: {
        worldId,
        ...dateFilter
      },
      include: [{
        model: db.User,
        attributes: ['userId', 'username', 'createdAt']
      }],
      order: [['score', 'DESC'], ['lastUpdated', 'ASC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    // Add rank and additional user stats
    const enhancedLeaderboard = await Promise.all(
      leaderboard.map(async (entry, index) => {
        const rank = parseInt(offset) + index + 1;
        
        // Get user's quest completion count in this world
        const questsCompleted = await db.Progress.count({
          where: {
            userId: entry.userId,
            status: 'verified'
          },
          include: [{
            model: db.Quest,
            where: { worldId },
            attributes: []
          }]
        });

        return {
          rank,
          user: {
            userId: entry.User.userId,
            username: entry.User.username,
            memberSince: entry.User.createdAt
          },
          score: entry.score,
          questsCompleted,
          lastUpdated: entry.lastUpdated
        };
      })
    );

    res.json({
      success: true,
      data: {
        world: world.toJSON(),
        period,
        leaderboard: enhancedLeaderboard,
        totalEntries: leaderboard.length
      }
    });
  });

  // Get global leaderboard (across all worlds)
  getGlobalLeaderboard = catchAsync(async (req, res) => {
    const { limit = 50, offset = 0, period = 'all' } = req.query;

    // Build date filter
    let dateCondition = '';
    const replacements = { limit: parseInt(limit), offset: parseInt(offset) };
    
    if (period !== 'all') {
      const days = period === 'week' ? 7 : period === 'month' ? 30 : period === 'year' ? 365 : null;
      if (days) {
        dateCondition = `AND l."lastUpdated" >= NOW() - INTERVAL '${days} days'`;
      }
    }

    const globalLeaderboard = await db.sequelize.query(`
      SELECT 
        u.username,
        u."userId",
        u."createdAt" as member_since,
        SUM(l.score) as total_score,
        COUNT(DISTINCT l."worldId") as worlds_completed,
        MAX(l."lastUpdated") as last_activity,
        COUNT(DISTINCT p."questId") as total_quests_completed
      FROM leaderboards l
      JOIN users u ON l."userId" = u."userId"
      LEFT JOIN progress p ON u."userId" = p."userId" AND p.status = 'verified'
      WHERE 1=1 ${dateCondition}
      GROUP BY u."userId", u.username, u."createdAt"
      ORDER BY total_score DESC, last_activity ASC
      LIMIT :limit OFFSET :offset
    `, {
      replacements,
      type: db.Sequelize.QueryTypes.SELECT
    });

    const rankedGlobalLeaderboard = globalLeaderboard.map((entry, index) => ({
      rank: parseInt(offset) + index + 1,
      user: {
        userId: entry.userId,
        username: entry.username,
        memberSince: entry.member_since
      },
      totalScore: parseInt(entry.total_score),
      worldsCompleted: parseInt(entry.worlds_completed),
      totalQuestsCompleted: parseInt(entry.total_quests_completed),
      lastActivity: entry.last_activity
    }));

    res.json({
      success: true,
      data: {
        period,
        leaderboard: rankedGlobalLeaderboard,
        totalEntries: globalLeaderboard.length
      }
    });
  });

  // Get user's ranking in a specific world
  getUserWorldRank = catchAsync(async (req, res, next) => {
    const { worldId, userId } = req.params;

    const userEntry = await db.Leaderboard.findOne({
      where: { worldId, userId },
      include: [{
        model: db.User,
        attributes: ['username']
      }]
    });

    if (!userEntry) {
      return next(new AppError('User not found in this world\'s leaderboard', 404));
    }

    // Calculate rank
    const rank = await db.Leaderboard.count({
      where: {
        worldId,
        [Op.or]: [
          { score: { [Op.gt]: userEntry.score } },
          {
            score: userEntry.score,
            lastUpdated: { [Op.lt]: userEntry.lastUpdated }
          }
        ]
      }
    }) + 1;

    // Get total participants in this world
    const totalParticipants = await db.Leaderboard.count({
      where: { worldId }
    });

    res.json({
      success: true,
      data: {
        worldId: parseInt(worldId),
        user: {
          userId: userEntry.userId,
          username: userEntry.User.username
        },
        rank,
        score: userEntry.score,
        totalParticipants,
        percentile: ((totalParticipants - rank + 1) / totalParticipants * 100).toFixed(1),
        lastUpdated: userEntry.lastUpdated
      }
    });
  });

  // Get user's global ranking
  getUserGlobalRank = catchAsync(async (req, res, next) => {
    const { userId } = req.params;

    const userStats = await db.sequelize.query(`
      SELECT 
        u.username,
        SUM(l.score) as total_score,
        COUNT(DISTINCT l."worldId") as worlds_completed,
        MAX(l."lastUpdated") as last_activity
      FROM leaderboards l
      JOIN users u ON l."userId" = u."userId"
      WHERE u."userId" = :userId
      GROUP BY u."userId", u.username
    `, {
      replacements: { userId },
      type: db.Sequelize.QueryTypes.SELECT
    });

    if (!userStats.length) {
      return next(new AppError('User not found in leaderboard', 404));
    }

    const user = userStats[0];

    // Calculate global rank
    const rank = await db.sequelize.query(`
      SELECT COUNT(*) + 1 as rank
      FROM (
        SELECT SUM(score) as total_score
        FROM leaderboards
        GROUP BY "userId"
        HAVING SUM(score) > :totalScore
      ) as higher_scores
    `, {
      replacements: { totalScore: user.total_score },
      type: db.Sequelize.QueryTypes.SELECT
    });

    // Get total global participants
    const totalParticipants = await db.sequelize.query(`
      SELECT COUNT(DISTINCT "userId") as count
      FROM leaderboards
    `, {
      type: db.Sequelize.QueryTypes.SELECT
    });

    res.json({
      success: true,
      data: {
        user: {
          userId: parseInt(userId),
          username: user.username
        },
        globalRank: parseInt(rank[0].rank),
        totalScore: parseInt(user.total_score),
        worldsCompleted: parseInt(user.worlds_completed),
        totalParticipants: parseInt(totalParticipants[0].count),
        percentile: ((totalParticipants[0].count - rank[0].rank + 1) / totalParticipants[0].count * 100).toFixed(1),
        lastActivity: user.last_activity
      }
    });
  });

  // Get leaderboard statistics
  getLeaderboardStats = catchAsync(async (req, res) => {
    const { worldId } = req.params;

    const stats = await db.sequelize.query(`
      SELECT 
        COUNT(DISTINCT l."userId") as total_participants,
        AVG(l.score) as average_score,
        MAX(l.score) as highest_score,
        MIN(l.score) as lowest_score,
        COUNT(DISTINCT w."worldId") as total_worlds
      FROM leaderboards l
      LEFT JOIN worlds w ON l."worldId" = w."worldId"
      ${worldId ? 'WHERE l."worldId" = :worldId' : ''}
    `, {
      replacements: worldId ? { worldId } : {},
      type: db.Sequelize.QueryTypes.SELECT
    });

    // Get score distribution
    const scoreDistribution = await db.sequelize.query(`
      SELECT 
        CASE 
          WHEN score < 100 THEN '0-99'
          WHEN score < 500 THEN '100-499'
          WHEN score < 1000 THEN '500-999'
          WHEN score < 2000 THEN '1000-1999'
          ELSE '2000+'
        END as score_range,
        COUNT(*) as count
      FROM leaderboards
      ${worldId ? 'WHERE "worldId" = :worldId' : ''}
      GROUP BY score_range
      ORDER BY 
        CASE score_range
          WHEN '0-99' THEN 1
          WHEN '100-499' THEN 2
          WHEN '500-999' THEN 3
          WHEN '1000-1999' THEN 4
          ELSE 5
        END
    `, {
      replacements: worldId ? { worldId } : {},
      type: db.Sequelize.QueryTypes.SELECT
    });

    res.json({
      success: true,
      data: {
        worldId: worldId ? parseInt(worldId) : null,
        overview: stats[0],
        scoreDistribution: scoreDistribution.map(d => ({
          range: d.score_range,
          count: parseInt(d.count)
        }))
      }
    });
  });
}

module.exports = new LeaderboardController();