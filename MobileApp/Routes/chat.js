const express = require('express');
const router = express.Router();
const db = require('../Models');
const { authMiddleware } = require('../middleware/auth');
const { Op } = require('sequelize');

// Get chat messages for a quest
router.get('/quests/:questId', authMiddleware, async (req, res) => {
  try {
    const { questId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const messages = await db.Chat.findAll({
      where: { questId },
      include: [{
        model: db.User,
        attributes: ['username']
      }],
      order: [['timestamp', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json(messages.reverse()); // Return in ascending order
  } catch (error) {
    res.status(500).json({ message: 'Failed to get chat messages', error: error.message });
  }
});

// Send chat message
router.post('/send', authMiddleware, async (req, res) => {
  try {
    const { questId, message } = req.body;
    const userId = req.user.userId;

    if (!message || message.trim().length === 0) {
      return res.status(400).json({ message: 'Message cannot be empty' });
    }

    if (message.length > 1000) {
      return res.status(400).json({ message: 'Message too long (max 1000 characters)' });
    }

    // Check if quest exists
    const quest = await db.Quest.findByPk(questId);
    if (!quest) {
      return res.status(404).json({ message: 'Quest not found' });
    }

    const chatMessage = await db.Chat.create({
      questId,
      userId,
      message: message.trim(),
      timestamp: new Date()
    });

    // Return message with user info
    const messageWithUser = await db.Chat.findByPk(chatMessage.chatId, {
      include: [{
        model: db.User,
        attributes: ['username']
      }]
    });

    res.status(201).json(messageWithUser);
  } catch (error) {
    res.status(500).json({ message: 'Failed to send message', error: error.message });
  }
});

// Delete chat message (user can only delete their own)
router.delete('/:chatId', authMiddleware, async (req, res) => {
  try {
    const { chatId } = req.params;
    
    const message = await db.Chat.findByPk(chatId);
    if (!message) {
      return res.status(404).json({ message: 'Message not found' });
    }

    // Check if user owns the message or is admin
    if (message.userId !== req.user.userId && !req.user.isAdmin) {
      return res.status(403).json({ message: 'Access denied' });
    }

    await message.destroy();
    res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete message', error: error.message });
  }
});

module.exports = router;