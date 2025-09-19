const { validationResult } = require('express-validator');
const zkTlsService = require('../services/zkTLSService');
const { logger } = require('../utils/logger');

// This will likely be your mobile app's domain in production
const APP_CALLBACK_URL = process.env.APP_CALLBACK_URL || 'http://localhost:3000/api/zk-tls/callback';

/**
 * Endpoint to initiate the Reclaim proof request.
 * This function builds the verification URL and sends it to the mobile app.
 */
exports.requestProof = async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { userId, proofType } = req.body;

    try {
        const reclaimUrl = zkTlsService.buildVerificationUrl(userId, proofType, APP_CALLBACK_URL);
        logger.info(`Reclaim URL generated for user ${userId}: ${reclaimUrl}`);
        res.status(200).json({ reclaimUrl });
    } catch (error) {
        logger.error(`Error generating Reclaim URL: ${error.message}`);
        res.status(500).json({ message: "Failed to generate Reclaim URL" });
    }
};

/**
 * The callback endpoint that Reclaim's service hits after a proof is generated.
 * This function receives the proof and then calls the service to verify and store it.
 */
exports.reclaimCallback = async (req, res) => {
    // Reclaim sends the proof data in the query parameters
    const { proof } = req.query;

    if (!proof) {
        logger.warn("Reclaim callback received without a proof.");
        return res.status(400).send("No proof found in callback.");
    }

    try {
        const verificationResult = await zkTlsService.verifyAndStoreProof(proof);
        logger.info(`Proof verified and stored successfully for user ${verificationResult.proofs[0].claimData.owner}`);

        // Redirect the user back to the mobile app with a success or failure status
        // You may want to construct a more robust URL here based on your app's deep link scheme
        res.status(200).send("Proof received and processed successfully.");
    } catch (error) {
        logger.error(`Failed to verify and store proof: ${error.message}`);
        res.status(500).send("Failed to process proof.");
    }
};
