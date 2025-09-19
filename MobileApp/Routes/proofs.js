const express = require('express');
const router = express.Router();
const db = require('../Models');
const gameService = require('../services/gameService');
const zkTLSService = require('../services/zkTLSService');
const { authMiddleware } = require('../middleware/auth');

// Submit proof for quest
// **UPDATED**: This endpoint now receives the completed proof data from the client,
// and delegates the verification and on-chain storage to the zkTLSService.
router.post('/submit', authMiddleware, async (req, res) => {
    try {
        const { questId, gameAccount, proofData } = req.body; // Expect `proofData` from the client
        const userId = req.user.userId;

        // Use zkTLSService to verify the proof data and store it on-chain
        const verificationResult = await zkTLSService.verifyAndStoreProof(proofData);

        // After verification, you can assess skill level and store progress.
        const stats = verificationResult?.proofs?.[0]?.claimData?.parameters;
        const skillLevel = stats ? gameService.assessSkillLevel(gameAccount, stats) : 'unknown';

        // Store the proof in your database
        const proof = await gameService.storeVerification(
            userId, questId, gameAccount, verificationResult.proofs[0].claimData.provider, stats, verificationResult.proofs[0].signatures
        );

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
            stats: stats,
            skillLevel: skillLevel,
            chainTransaction: verificationResult.transactionHash // Assuming verifyAndStoreProof returns this
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
        // **UPDATED**: The call to zkTLSService.verifyProof now uses the data from the stored proof
        const verificationResult = await zkTLSService.verifyAndStoreProof(
            JSON.stringify({ proofs: [{ statFetched: proof.statFetched, verificationHash: proof.verificationHash }] })
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
