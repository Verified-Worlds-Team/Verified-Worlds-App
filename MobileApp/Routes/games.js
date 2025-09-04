const express = require('express');
const router = express.Router();
const gameService = require('../services/gameService');
const zkTLSService = require('../services/zkTLSService');
const { authMiddleware } = require('../middleware/auth');
const { validateGameVerification } = require('../middleware/validation');

// Get supported games
router.get('/supported', async (req, res) => {
  try {
    const supportedGames = gameService.getSupportedGames();
    res.json(supportedGames);
  } catch (error) {
    res.status(500).json({ message: 'Failed to get supported games', error: error.message });
  }
});

// Verify player stats
router.post('/verify-stats', authMiddleware, validateGameVerification, async (req, res) => {
  try {
    const { game, gameAccount, questId } = req.body;
    const userId = req.user.userId;

    // Fetch stats from game API
    const stats = await gameService.fetchPlayerStats(game, gameAccount);
    
    // Generate zkTLS proof
    const proof = await zkTLSService.generateProof(game, gameAccount, stats);
    
    // Store verification result
    const verificationResult = await gameService.storeVerification(
      userId, 
      questId, 
      gameAccount, 
      game, 
      stats, 
      proof
    );

    res.json({
      success: true,
      data: verificationResult,
      stats: stats
    });
  } catch (error) {
    console.error('Verification error:', error);
    res.status(400).json({ 
      message: 'Verification failed', 
      error: error.message 
    });
  }
});

// Get player verification history
router.get('/verifications/:userId', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Ensure user can only access their own data or is admin
    if (req.user.userId !== parseInt(userId) && !req.user.isAdmin) {
      return res.status(403).json({ message: 'Access denied' });
    }

    const verifications = await gameService.getUserVerifications(userId);
    res.json(verifications);
  } catch (error) {
    res.status(500).json({ message: 'Failed to get verifications', error: error.message });
  }
});

module.exports = router;