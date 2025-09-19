const rateLimit = require('express-rate-limit');
const slowDown = require('express-slow-down');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const cors = require('cors');
const { AppError } = require('../utils/errorHandler');
const { auditLogger } = require('../utils/logger');

// Enhanced Rate Limiting
const createRateLimiter = (windowMs, max, message) => {
    return rateLimit({
        windowMs,
        max,
        message: {
            success: false,
            message
        },
        standardHeaders: true,
        legacyHeaders: false,
        handler: (req, res) => {
            auditLogger.warn('Rate limit exceeded', {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                endpoint: req.originalUrl
            });
            res.status(429).json({
                success: false,
                message
            });
        }
    });
};

// Different rate limits for different endpoints
const authLimiter = createRateLimiter(
    15 * 60 * 1000, // 15 minutes
    5, // 5 attempts
    'Too many authentication attempts, please try again later'
);

const apiLimiter = createRateLimiter(
    15 * 60 * 1000, // 15 minutes
    100, // 100 requests
    'Too many API requests, please try again later'
);

const verificationLimiter = slowDown({
    windowMs: 60 * 60 * 1000, // 1 hour
    delayAfter: 10, // Begin slowing down responses after 10 requests
    delayMs: () => 500, // Add 500ms of delay to each request after the limit is reached
});

const speedLimiter = slowDown({
    windowMs: 15 * 60 * 1000, // 15 minutes
    delayAfter: 50, // allow 50 requests per 15 minutes, then...
    delayMs: () => 500, // begin adding 500ms of delay per request above 50
});

// Enhanced CORS configuration
const corsOptions = {
    origin: function (origin, callback) {
        const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [
            'http://localhost:3001',
            'http://localhost:19006', // Expo dev
            'exp://localhost:19000' // Expo dev
        ];

        // Allow requests with no origin (mobile apps, etc.)
        if (!origin) return callback(null, true);

        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            auditLogger.warn('CORS blocked request', { origin, ip: req?.ip });
            callback(new AppError('Not allowed by CORS', 403));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-api-key'],
    exposedHeaders: ['X-Total-Count']
};

// Security headers configuration
const helmetConfig = {
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "[https://api.github.com](https://api.github.com)"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"]
        }
    },
    crossOriginEmbedderPolicy: false,
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    }
};

// Request sanitization
const sanitizeInput = (req, res, next) => {
    // Remove NoSQL injection attempts
    mongoSanitize()(req, res, () => {
        // Clean user input from malicious HTML
        xss()(req, res, () => {
            // Prevent HTTP Parameter Pollution
            hpp({
                whitelist: ['tags', 'fields'] // Allow arrays for certain fields
            })(req, res, next);
        });
    });
};

// API Key validation middleware
const validateApiKey = (req, res, next) => {
    const apiKey = req.header('x-api-key');
    const validApiKeys = process.env.API_KEYS?.split(',') || [];

    if (req.originalUrl.startsWith('/api/public')) {
        return next(); // Skip API key for public endpoints
    }

    if (!apiKey || !validApiKeys.includes(apiKey)) {
        auditLogger.warn('Invalid API key attempt', {
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            apiKey: apiKey?.substring(0, 8) + '...'
        });
        return next(new AppError('Invalid API key', 401));
    }

    next();
};

// Export all middleware functions so they can be imported and used elsewhere
module.exports = {
    authLimiter,
    apiLimiter,
    verificationLimiter,
    speedLimiter,
    corsOptions,
    helmetConfig,
    sanitizeInput,
    validateApiKey,
};
