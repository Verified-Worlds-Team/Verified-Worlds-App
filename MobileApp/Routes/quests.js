const express = require('express');
const router = express.Router();
const db = require('../Models');
const { authMiddleware } = require('../middleware/auth');

// Get all worlds
router.get('/worlds', async (req, res) => {
  try {
    const worlds = await db.World.findAll({
      include: [{
        model: db.Quest,
        include: [{ model: db.Reward }]
      }]
    });
    res.json(worlds);
  } catch (error) {
    res.status(500).json({ message: 'Failed to get worlds', error: error.message });
  }
});

// Get quests by world
router.get('/worlds/:worldId/quests', async (req, res) => {
  try {
    const { worldId } = req.params;
    const quests = await db.Quest.findAll({
      where: { worldId },
      include: [{ model: db.Reward }]
    });
    res.json(quests);
  } catch (error) {
    res.status(500).json({ message: 'Failed to get quests', error: error.message });
  }
});

// Get user progress
router.get('/progress/:userId', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (req.user.userId !== parseInt(userId) && !req.user.isAdmin) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const progress = await db.Progress.findAll({
      where: { userId },
      include: [{
        model: db.Quest,
        include: [{ model: db.World }, { model: db.Reward }]
      }]
    });
    res.json(progress);
  } catch (error) {
    res.status(500).json({ message: 'Failed to get progress', error: error.message });
  }
});

// Start quest
router.post('/start', authMiddleware, async (req, res) => {
  try {
    const { questId } = req.body;
    const userId = req.user.userId;

    // Check if quest exists
    const quest = await db.Quest.findByPk(questId);
    if (!quest) {
      return res.status(404).json({ message: 'Quest not found' });
    }

    // Check if user already has progress for this quest
    const existingProgress = await db.Progress.findOne({
      where: { userId, questId }
    });

    if (existingProgress) {
      return res.status(400).json({ message: 'Quest already started' });
    }

    const progress = await db.Progress.create({
      userId,
      questId,
      status: 'in_progress'
    });

    res.json({
      message: 'Quest started successfully',
      progress
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to start quest', error: error.message });
  }
});

// Complete quest
router.post('/complete', authMiddleware, async (req, res) => {
  try {
    const { questId, score } = req.body;
    const userId = req.user.userId;

    const progress = await db.Progress.findOne({
      where: { userId, questId }
    });

    if (!progress) {
      return res.status(404).json({ message: 'Quest progress not found' });
    }

    if (progress.status === 'completed') {
      return res.status(400).json({ message: 'Quest already completed' });
    }

    await progress.update({
      status: 'completed',
      completedAt: new Date(),
      score: score || 0
    });

    // Update leaderboard
    const quest = await db.Quest.findByPk(questId);
    await this.updateLeaderboard(userId, quest.worldId, score || 0);

    res.json({
      message: 'Quest completed successfully',
      progress
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to complete quest', error: error.message });
  }
});

// Helper function to update leaderboard
async function updateLeaderboard(userId, worldId, score) {
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
}

module.exports = router;