const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { Op } = require('sequelize');
const db = require('../Models');
const { AppError, catchAsync } = require('../utils/errorHandler');
const { generateTokens, verifyRefreshToken } = require('../utils/tokenManager');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../services/emailService');
const { validateWalletSignature } = require('../utils/cryptoUtils');
const logger = require('../utils/logger');

class AuthController {
  // User Registration with Email Verification
  register = catchAsync(async (req, res, next) => {
    const { username, email, password, walletAddress } = req.body;

    // Check for existing users
    const existingUser = await db.User.findOne({
      where: {
        [Op.or]: [{ email }, { username }]
      }
    });

    if (existingUser) {
      return next(new AppError('User with this email or username already exists', 400));
    }

    // Hash password with high cost
    const saltRounds = 14;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Generate email verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const user = await db.User.create({
      username,
      email,
      passwordHash,
      walletAddress,
      verificationToken,
      verificationExpires,
      isVerified: false
    });

    // Send verification email
    await sendVerificationEmail(user.email, verificationToken);

    logger.info(`New user registered: ${username} (${email})`);

    res.status(201).json({
      success: true,
      message: 'Registration successful. Please check your email for verification.',
      data: {
        userId: user.userId,
        username: user.username,
        email: user.email,
        requiresVerification: true
      }
    });
  });

  // Email Verification
  verifyEmail = catchAsync(async (req, res, next) => {
    const { token } = req.params;

    const user = await db.User.findOne({
      where: {
        verificationToken: token,
        verificationExpires: { [Op.gt]: new Date() }
      }
    });

    if (!user) {
      return next(new AppError('Invalid or expired verification token', 400));
    }

    await user.update({
      isVerified: true,
      verificationToken: null,
      verificationExpires: null
    });

    logger.info(`User verified email: ${user.email}`);

    res.json({
      success: true,
      message: 'Email verified successfully'
    });
  });

  // Enhanced Login with Rate Limiting & Attempt Tracking
  login = catchAsync(async (req, res, next) => {
    const { login, password, deviceInfo } = req.body;
    const clientIp = req.ip;

    if (!login || !password) {
      return next(new AppError('Email/username and password are required', 400));
    }

    // Find user with login attempts
    const user = await db.User.findOne({
      where: {
        [Op.or]: [{ email: login }, { username: login }]
      }
    });

    if (!user) {
      return next(new AppError('Invalid credentials', 401));
    }

    // Check if account is locked
    if (user.lockoutUntil && user.lockoutUntil > new Date()) {
      const timeLeft = Math.ceil((user.lockoutUntil - new Date()) / (1000 * 60));
      return next(new AppError(`Account locked. Try again in ${timeLeft} minutes`, 423));
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    
    if (!isValidPassword) {
      // Increment failed attempts
      const attempts = (user.loginAttempts || 0) + 1;
      const lockoutUntil = attempts >= 5 ? new Date(Date.now() + 30 * 60 * 1000) : null;
      
      await user.update({
        loginAttempts: attempts,
        lockoutUntil,
        lastFailedLogin: new Date()
      });

      logger.warn(`Failed login attempt for ${login} from ${clientIp}. Attempts: ${attempts}`);
      return next(new AppError('Invalid credentials', 401));
    }

    // Check if email is verified
    if (!user.isVerified) {
      return next(new AppError('Please verify your email before logging in', 401));
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateTokens(user);

    // Reset login attempts and update login info
    await user.update({
      loginAttempts: 0,
      lockoutUntil: null,
      lastLogin: new Date(),
      lastLoginIp: clientIp
    });

    // Store refresh token securely
    await db.RefreshToken.create({
      userId: user.userId,
      token: refreshToken,
      deviceInfo: deviceInfo || 'Unknown device',
      ipAddress: clientIp,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });

    logger.info(`Successful login: ${user.username} from ${clientIp}`);

    // Set secure HTTP-only cookie for refresh token
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          userId: user.userId,
          username: user.username,
          email: user.email,
          walletAddress: user.walletAddress,
          isVerified: user.isVerified,
          role: user.role
        },
        accessToken,
        expiresIn: '15m'
      }
    });
  });

  // Token Refresh
  refreshToken = catchAsync(async (req, res, next) => {
    const { refreshToken } = req.cookies;

    if (!refreshToken) {
      return next(new AppError('Refresh token not provided', 401));
    }

    const decoded = verifyRefreshToken(refreshToken);
    
    const tokenRecord = await db.RefreshToken.findOne({
      where: {
        token: refreshToken,
        userId: decoded.userId,
        expiresAt: { [Op.gt]: new Date() }
      },
      include: [{ model: db.User }]
    });

    if (!tokenRecord) {
      return next(new AppError('Invalid refresh token', 401));
    }

    const user = tokenRecord.User;
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);

    // Update refresh token
    await tokenRecord.update({
      token: newRefreshToken,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });

    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });

    res.json({
      success: true,
      data: {
        accessToken,
        expiresIn: '15m'
      }
    });
  });

  // Secure Logout (All devices)
  logout = catchAsync(async (req, res) => {
    const { refreshToken } = req.cookies;
    
    if (refreshToken) {
      await db.RefreshToken.destroy({
        where: { token: refreshToken }
      });
    }

    res.clearCookie('refreshToken');
    
    logger.info(`User logged out: ${req.user?.username}`);

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  });

  // Logout from all devices
  logoutAll = catchAsync(async (req, res) => {
    await db.RefreshToken.destroy({
      where: { userId: req.user.userId }
    });

    res.clearCookie('refreshToken');
    
    logger.info(`User logged out from all devices: ${req.user.username}`);

    res.json({
      success: true,
      message: 'Logged out from all devices'
    });
  });

  // Wallet Connection with Signature Verification
  connectWallet = catchAsync(async (req, res, next) => {
    const { walletAddress, signature, message, chainId = 'xion-testnet-1' } = req.body;
    
    if (!walletAddress || !signature || !message) {
      return next(new AppError('Wallet address, signature, and message are required', 400));
    }

    // Verify the signature
    const isValidSignature = await validateWalletSignature(
      walletAddress, 
      message, 
      signature, 
      chainId
    );

    if (!isValidSignature) {
      return next(new AppError('Invalid wallet signature', 400));
    }

    // Check if wallet is already connected to another user
    const existingWallet = await db.User.findOne({
      where: {
        walletAddress,
        userId: { [Op.ne]: req.user.userId }
      }
    });

    if (existingWallet) {
      return next(new AppError('Wallet already connected to another account', 400));
    }

    await req.user.update({ 
      walletAddress,
      walletConnectedAt: new Date()
    });

    logger.info(`Wallet connected: ${req.user.username} -> ${walletAddress}`);

    res.json({
      success: true,
      message: 'Wallet connected successfully',
      data: { walletAddress }
    });
  });

  // Password Reset Request
  requestPasswordReset = catchAsync(async (req, res, next) => {
    const { email } = req.body;

    const user = await db.User.findOne({ where: { email } });
    
    if (!user) {
      // Don't reveal if email exists
      return res.json({
        success: true,
        message: 'If the email exists, a reset link has been sent'
      });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await user.update({
      passwordResetToken: resetToken,
      passwordResetExpires: resetExpires
    });

    await sendPasswordResetEmail(email, resetToken);

    logger.info(`Password reset requested for: ${email}`);

    res.json({
      success: true,
      message: 'If the email exists, a reset link has been sent'
    });
  });

  // Password Reset
  resetPassword = catchAsync(async (req, res, next) => {
    const { token } = req.params;
    const { password } = req.body;

    const user = await db.User.findOne({
      where: {
        passwordResetToken: token,
        passwordResetExpires: { [Op.gt]: new Date() }
      }
    });

    if (!user) {
      return next(new AppError('Invalid or expired reset token', 400));
    }

    const saltRounds = 14;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    await user.update({
      passwordHash,
      passwordResetToken: null,
      passwordResetExpires: null,
      loginAttempts: 0,
      lockoutUntil: null
    });

    // Invalidate all refresh tokens for security
    await db.RefreshToken.destroy({
      where: { userId: user.userId }
    });

    logger.info(`Password reset completed for: ${user.email}`);

    res.json({
      success: true,
      message: 'Password reset successful'
    });
  });

  // Get User Profile with Security Info
  getProfile = catchAsync(async (req, res) => {
    const user = await db.User.findByPk(req.user.userId, {
      attributes: { 
        exclude: ['passwordHash', 'passwordResetToken', 'verificationToken'] 
      },
      include: [
        {
          model: db.RefreshToken,
          attributes: ['deviceInfo', 'ipAddress', 'createdAt'],
          where: { expiresAt: { [Op.gt]: new Date() } },
          required: false
        }
      ]
    });

    res.json({
      success: true,
      data: user
    });
  });

  // Update Profile with validation
  updateProfile = catchAsync(async (req, res, next) => {
    const { username, email } = req.body;
    const updateData = {};

    if (username && username !== req.user.username) {
      const existingUsername = await db.User.findOne({
        where: { 
          username, 
          userId: { [Op.ne]: req.user.userId } 
        }
      });
      
      if (existingUsername) {
        return next(new AppError('Username already taken', 400));
      }
      updateData.username = username;
    }

    if (email && email !== req.user.email) {
      const existingEmail = await db.User.findOne({
        where: { 
          email, 
          userId: { [Op.ne]: req.user.userId } 
        }
      });
      
      if (existingEmail) {
        return next(new AppError('Email already taken', 400));
      }
      
      // Require email verification for new email
      updateData.email = email;
      updateData.isVerified = false;
      updateData.verificationToken = crypto.randomBytes(32).toString('hex');
      updateData.verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
      
      await sendVerificationEmail(email, updateData.verificationToken);
    }

    await req.user.update(updateData);

    logger.info(`Profile updated: ${req.user.username}`);

    res.json({
      success: true,
      message: email !== req.user.email ? 
        'Profile updated. Please verify your new email.' : 
        'Profile updated successfully',
      data: {
        username: req.user.username,
        email: req.user.email,
        requiresVerification: !req.user.isVerified
      }
    });
  });
}

module.exports = new AuthController();