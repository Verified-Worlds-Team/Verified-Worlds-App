/*const { catchAsync, AppError } = require('../utils/errorHandler');
const { auditLogger } = require('../utils/logger');
const db = require('../Models');
const { Op } = require('sequelize');

class ChatController {
  // Get chat messages for a quest
  getQuestMessages = catchAsync(async (req, res, next) => {
    const { questId } = req.params;
    const { limit = 50, offset = 0, before } = req.query;

    // Check if quest exists
    const quest = await db.Quest.findByPk(questId, {
      attributes: ['questId', 'title']
    });

    if (!quest) {
      return next(new AppError('Quest not found', 404));
    }

    const whereClause = { questId };
    if (before) {
      whereClause.timestamp = { [Op.lt]: new Date(before) };
    }

    const messages = await db.Chat.findAll({
      where: whereClause,
      include: [{
        model: db.User,
        attributes: ['userId', 'username']
      }],
      order: [['timestamp', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      data: {
        quest: quest.toJSON(),
        messages: messages.reverse(), // Return in ascending order (oldest first)
        hasMore: messages.length === parseInt(limit)
      }
    });
  });

  // Send a chat message
  sendMessage = catchAsync(async (req, res, next) => {
    const { questId, message } = req.body;
    const userId = req.user.userId;

    if (!message || message.trim().length === 0) {
      return next(new AppError('Message cannot be empty', 400));
    }

    if (message.length > 1000) {
      return next(new AppError('Message too long (max 1000 characters)', 400));
    }

    // Check if quest exists
    const quest = await db.Quest.findByPk(questId);
    if (!quest) {
      return next(new AppError('Quest not found', 404));
    }

    // Rate limiting: max 10 messages per minute per user
    const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
    const recentMessageCount = await db.Chat.count({
      where: {
        userId,
        timestamp: { [Op.gte]: oneMinuteAgo }
      }
    });

    if (recentMessageCount >= 10) {
      return next(new AppError('Rate limit exceeded. Please wait before sending another message.', 429));
    }

    // Create the message
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
        attributes: ['userId', 'username']
      }]
    });

    auditLogger.info('Chat message sent', {
      userId,
      questId,
      messageLength: message.length,
      timestamp: chatMessage.timestamp
    });

    res.status(201).json({
      success: true,
      data: {
        message: messageWithUser.toJSON()
      }
    });
  });

  // Edit a chat message (within 5 minutes)
  editMessage = catchAsync(async (req, res, next) => {
    const { chatId } = req.params;
    const { message } = req.body;
    const userId = req.user.userId;

    if (!message || message.trim().length === 0) {
      return next(new AppError('Message cannot be empty', 400));
    }

    if (message.length > 1000) {
      return next(new AppError('Message too long (max 1000 characters)', 400));
    }

    const chatMessage = await db.Chat.findByPk(chatId);
    if (!chatMessage) {
      return next(new AppError('Message not found', 404));
    }

    // Check ownership
    if (chatMessage.userId !== userId) {
      return next(new AppError('You can only edit your own messages', 403));
    }

    // Check if message is within edit window (5 minutes)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    if (chatMessage.timestamp < fiveMinutesAgo) {
      return next(new AppError('Messages can only be edited within 5 minutes of posting', 403));
    }

    await chatMessage.update({
      message: message.trim(),
      editedAt: new Date()
    });

    auditLogger.info('Chat message edited', {
      userId,
      chatId,
      questId: chatMessage.questId,
      editedAt: new Date()
    });

    res.json({
      success: true,
      data: {
        message: chatMessage.toJSON()
      }
    });
  });

  // Delete a chat message
  deleteMessage = catchAsync(async (req, res, next) => {
    const { chatId } = req.params;
    const userId = req.user.userId;

    const message = await db.Chat.findByPk(chatId);
    if (!message) {
      return next(new AppError('Message not found', 404));
    }

    // Check if user owns the message or is admin
    if (message.userId !== userId && req.user.role !== 'admin') {
      return next(new AppError('Access denied', 403));
    }

    auditLogger.info('Chat message deleted', {
      deletedBy: userId,
      originalUserId: message.userId,
      chatId,
      questId: message.questId,
      isAdmin: req.user.role === 'admin'
    });

    await message.destroy();

    res.json({
      success: true,
      message: 'Message deleted successfully'
    });
  });

  // Get user's chat history
  getUserChatHistory = catchAsync(async (req, res, next) => {
    const { userId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    // Authorization check
    if (req.user.userId !== parseInt(userId) && req.user.role !== 'admin') {
      return next(new AppError('Access denied', 403));
    }

    const messages = await db.Chat.findAll({
      where: { userId },
      include: [{
        model: db.Quest,
        attributes: ['questId', 'title'],
        include: [{
          model: db.World,
          attributes: ['worldId', 'name']
        }]
      }],
      order: [['timestamp', 'DESC']],
      limit: parseInt(limit),
      offset: parseInt(offset)
    });

    res.json({
      success: true,
      data: {
        userId: parseInt(userId),
        messages: messages.map(msg => ({
          ...msg.toJSON(),
          quest: {
            questId: msg.Quest.questId,
            title: msg.Quest.title,
            world: msg.Quest.World
          }
        })),
        pagination: {
          limit: parseInt(limit),
          offset: parseInt(offset),
          hasMore: messages.length === parseInt(limit) */
        