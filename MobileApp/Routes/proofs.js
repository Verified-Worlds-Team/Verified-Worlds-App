const express = require('express');
const router = express.Router();
const db = require('../Models');
const gameService = require('../services/gameService');
const zkTLSService = require('../services/zkTLSService');
const { authMiddleware } = require('../middleware/auth');

// Submit proof for quest
router.post('/submit', authMiddleware, async (req, res) => {
  try {
    const { questId, game, gameAccount } = req.body;
    const userId = req.user.userId;

    // Fetch and verify stats
    const stats = await gameService.fetchPlayerStats(game, gameAccount);
    
    // Generate zkTLS proof
    const zkProof = await zkTLSService.generateProof(game, gameAccount, stats);
    
    // Store proof
    const proof = await gameService.storeVerification(
      userId, questId, gameAccount, game, stats, zkProof
    );

    // Submit to blockchain
    const chainResult = await zkTLSService.submitToChain(zkProof, userId, questId);

    // Update quest progress to verified
    await db.Progress.findOne({
      where: { userId, questId }
    }).then(progress => {
      if (progress) {
        return progress.update({ status: 'verified' });
      }
    });

    res.json({
      success: true,
      proof,
      stats: stats.stats,
      skillLevel: gameService.assessSkillLevel(game, stats.stats),
      chainTransaction: chainResult.transactionHash
    });
  } catch (error) {
    console.error('Proof submission error:', error);
    res.status(400).json({ 
      message: 'Proof submission failed', 
      error: error.message 
    });
  }
});

// Get proof details
router.get('/:proofId', authMiddleware, async (req, res) => {
  try {
    const { proofId } = req.params;
    
    const proof = await db.Proof.findByPk(proofId, {
      include: [
        { model: db.User, attributes: ['username'] },
        { model: db.Quest, attributes: ['title', 'description'] }
      ]
    });

    if (!proof) {
      return res.status(404).json({ message: 'Proof not found' });
    }

    // Check access permissions
    if (proof.userId !== req.user.userId && !req.user.isAdmin) {
      return res.status(403).json({ message: 'Access denied' });
    }

    res.json(proof);
  } catch (error) {
    res.status(500).json({ message: 'Failed to get proof', error: error.message });
  }
});

// Verify proof
router.post('/:proofId/verify', authMiddleware, async (req, res) => {
  try {
    const { proofId } = req.params;
    
    const proof = await db.Proof.findByPk(proofId);
    if (!proof) {
      return res.status(404).json({ message: 'Proof not found' });
    }

    // Re-verify the proof using zkTLS
    const verificationResult = await zkTLSService.verifyProof(
      proof.statFetched, 
      proof.verificationHash
    );

    await proof.update({ 
      verified: verificationResult.valid,
      verificationHash: verificationResult.verifier_signature
    });

    res.json({
      verified: verificationResult.valid,
      proof: proof
    });
  } catch (error) {
    res.status(500).json({ message: 'Verification failed', error: error.message });
  }
});

module.exports = router;