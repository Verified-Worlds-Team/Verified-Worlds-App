const express = require('express');
const { body } = require('express-validator');
const zkTlsController = require('../Controllers/zkTlsController');
const router = express.Router();

// Route to request a Reclaim proof
router.post(
    '/request-proof',
    [
        body('userId').notEmpty().withMessage('User ID is required'),
        body('proofType').notEmpty().withMessage('Proof type is required'),
    ],
    zkTlsController.requestProof
);

// Route for Reclaim's callback to send the proof
router.get('/callback', zkTlsController.reclaimCallback);

module.exports = router;
