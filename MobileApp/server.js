const express = require('express');
const compression = require('compression');
const hpp = require('hpp');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Import utilities and middleware
const { globalErrorHandler, AppError } = require('./utils/errorHandler');
const { logger, auditLogger } = require('./utils/logger');
const {
    corsOptions,
    helmetConfig,
    sanitizeInput,
    validateApiKey,
    requestLogger,
    apiLimiter,
    speedLimiter
} = require('./middleware/security');

// Import database
const db = require('./Models');

// Import route handlers
const authRoutes = require('./routes/auth');
const gameRoutes = require('./routes/games');
const questRoutes = require('./routes/quests');
const proofRoutes = require('./routes/proofs');
const leaderboardRoutes = require('./routes/leaderboards');
const chatRoutes = require('./routes/chat');
const adminRoutes = require('./routes/admin');
// Updated: Import User and World routes
const userRoutes = require('./routes/userRoutes');
const worldRoutes = require('./routes/worldRoutes');

const app = express();

// Trust proxy (for accurate IP addresses behind reverse proxy)
app.set('trust proxy', 1);

// Ensure logs directory exists
const logDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
}

// Global middleware
app.use(require('helmet')(helmetConfig));
app.use(compression()); // Compress responses
app.use(require('cors')(corsOptions));

// Body parsing with size limits
app.use(express.json({
    limit: '10mb',
    verify: (req, res, buf) => {
        // Store raw body for webhook verification
        req.rawBody = buf;
    }
}));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Security middleware
app.use(sanitizeInput); // XSS protection and input sanitization
app.use(hpp()); // HTTP Parameter Pollution protection
app.use(speedLimiter); // Progressive delay on repeated requests

// Request logging
app.use(requestLogger);

// API key validation (skip for public endpoints)
app.use(validateApiKey);

// Rate limiting
app.use('/api/', apiLimiter);

// Health check endpoint (no auth required)
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV,
        version: process.env.npm_package_version || '1.0.0'
    });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/games', gameRoutes);
app.use('/api/quests', questRoutes);
app.use('/api/proofs', proofRoutes);
app.use('/api/leaderboards', leaderboardRoutes);
app.use('/api/chat', chatRoutes);
app.use('/api/admin', adminRoutes);
// Updated: Define a route for user-related API endpoints
app.use('/api/users', userRoutes);
// Updated: Define a route for world-related API endpoints
app.use('/api/worlds', worldRoutes);

// Public documentation endpoint
app.get('/api/docs', (req, res) => {
    res.json({
        name: 'Game Verifier API',
        version: '1.0.0',
        documentation: 'https://your-docs-url.com',
        supportedGames: ['league_of_legends', 'valorant', 'counter_strike'],
        endpoints: {
            auth: '/api/auth/*',
            games: '/api/games/*',
            quests: '/api/quests/*',
            proofs: '/api/proofs/*',
            leaderboards: '/api/leaderboards/*',
            chat: '/api/chat/*',
            // Updated: Add documentation for the new API endpoints
            users: '/api/users/*',
            worlds: '/api/worlds/*'
        }
    });
});

// Webhook endpoint for XION blockchain events
app.post('/webhooks/xion', express.raw({ type: 'application/json' }), (req, res) => {
    // Handle blockchain events
    try {
        const payload = JSON.parse(req.body);
        logger.info('XION webhook received', { payload });
        res.status(200).json({ received: true });
    } catch (error) {
        logger.error('Webhook processing failed', { error: error.message });
        res.status(400).json({ error: 'Invalid payload' });
    }
});

// 404 handler
app.all('*', (req, res, next) => {
    next(new AppError(`Can't find ${req.originalUrl} on this server!`, 404));
});

// Global error handling middleware
app.use(globalErrorHandler);

// Graceful shutdown handling
const gracefulShutdown = (signal) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);

    server.close(() => {
        logger.info('Process terminated');
        db.sequelize.close().then(() => {
            process.exit(0);
        });
    });

    // Force close after 10 seconds
    setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 10000);
};

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    logger.error('UNCAUGHT EXCEPTION! 💥 Shutting down...', {
        error: err.message,
        stack: err.stack
    });
    process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
    logger.error('UNHANDLED REJECTION! 💥 Shutting down...', {
        error: err.message,
        promise
    });
    server.close(() => {
        process.exit(1);
    });
});

// Handle termination signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Database connection and server startup
const startServer = async () => {
    try {
        // Test database connection
        await db.sequelize.authenticate();
        logger.info('Database connection established successfully');

        // Sync database models (use { alter: true } for development)
        const syncOptions = process.env.NODE_ENV === 'production'
            ? { logging: false }
            : { alter: true, logging: console.log };

        await db.sequelize.sync(syncOptions);
        logger.info('Database synchronized successfully');

        // Start server
        const PORT = process.env.PORT || 3000;
        const server = app.listen(PORT, () => {
            logger.info(`🚀 Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
            auditLogger.info('Server started', {
                port: PORT,
                environment: process.env.NODE_ENV,
                nodeVersion: process.version
            });
        });

        // Keep reference for graceful shutdown
        global.server = server;

        return server;

    } catch (error) {
        logger.error('Failed to start server', {
            error: error.message,
            stack: error.stack
        });
        process.exit(1);
    }
};

// Start the server
if (require.main === module) {
    startServer();
}

module.exports = app;