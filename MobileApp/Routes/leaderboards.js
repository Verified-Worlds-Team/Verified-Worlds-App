const express = require('express');
const router = express.Router();
const db = require('../Models');
const { Op } = require('sequelize');

// Get world leaderboard
router.get('/worlds/:worldId', async (req, res) => {
  try {
    const { worldId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const leaderboard = await db.Leaderboard.findAll({
      where: { worldId },
      include: [{
        model: db.User,
        attributes: ['username']
      }],
      order: [['score', 'DESC'], ['lastUpdated', 'ASC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    // Add rank to each entry
    const rankedLeaderboard = leaderboard.map((entry, index) => ({
      ...entry.toJSON(),
      rank: parseInt(offset) + index + 1
    }));

    res.json(rankedLeaderboard);
  } catch (error) {
    res.status(500).json({ message: 'Failed to get leaderboard', error: error.message });
  }
});

// Get global leaderboard (across all worlds)
router.get('/global', async (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const globalLeaderboard = await db.sequelize.query(`
      SELECT 
        u.username,
        u."userId",
        SUM(l.score) as totalScore,
        COUNT(DISTINCT l."worldId") as worldsCompleted,
        MAX(l."lastUpdated") as lastActivity
      FROM leaderboards l
      JOIN users u ON l."userId" = u."userId"
      GROUP BY u."userId", u.username
      ORDER BY totalScore DESC, lastActivity ASC
      LIMIT :limit OFFSET :offset
    `, {
      replacements: { limit: parseInt(limit), offset: parseInt(offset) },
      type: db.Sequelize.QueryTypes.SELECT
    });

    const rankedGlobalLeaderboard = globalLeaderboard.map((entry, index) => ({
      ...entry,
      rank: parseInt(offset) + index + 1
    }));

    res.json(rankedGlobalLeaderboard);
  } catch (error) {
    res.status(500).json({ message: 'Failed to get global leaderboard', error: error.message });
  }
});

// Get user's ranking in a world
router.get('/worlds/:worldId/users/:userId/rank', async (req, res) => {
  try {
    const { worldId, userId } = req.params;

    const userEntry = await db.Leaderboard.findOne({
      where: { worldId, userId }
    });

    if (!userEntry) {
      return res.status(404).json({ message: 'User not found in leaderboard' });
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

    res.json({
      rank,
      score: userEntry.score,
      lastUpdated: userEntry.lastUpdated
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to get user rank', error: error.message });
  }
});

module.exports = router;