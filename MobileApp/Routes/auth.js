const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const router = express.Router();
const db = require('../Models');
const { validateUserRegistration } = require('../middleware/validation');
const { authMiddleware } = require('../middleware/auth');

// Register
router.post('/register', validateUserRegistration, async (req, res) => {
  try {
    const { username, email, password, walletAddress } = req.body;

    // Check if user exists
    const existingUser = await db.User.findOne({
      where: {
        $or: [{ email }, { username }]
      }
    });

    if (existingUser) {
      return res.status(400).json({ 
        message: 'User with this email or username already exists' 
      });
    }

    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user
    const user = await db.User.create({
      username,
      email,
      passwordHash,
      walletAddress: walletAddress || null
    });

    // Generate JWT
    const token = jwt.sign(
      { userId: user.userId, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful',
      user: {
        userId: user.userId,
        username: user.username,
        email: user.email,
        walletAddress: user.walletAddress,
        isVerified: user.isVerified
      },
      token
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ message: 'Login failed', error: error.message });
  }
});

// Get current user
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const user = await db.User.findByPk(req.user.userId, {
      attributes: { exclude: ['passwordHash'] }
    });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Failed to get user info', error: error.message });
  }
});

// Connect wallet
router.post('/connect-wallet', authMiddleware, async (req, res) => {
  try {
    const { walletAddress, signature } = req.body;
    
    if (!walletAddress || !signature) {
      return res.status(400).json({ message: 'Wallet address and signature required' });
    }

    // Verify wallet signature (simplified)
    // In production, verify the signature against a challenge message
    
    await req.user.update({ walletAddress });
    
    res.json({
      message: 'Wallet connected successfully',
      walletAddress
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to connect wallet', error: error.message });
  }
});

module.exports = router;