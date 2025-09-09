const express = require('express');
const router = express.Router();
const gameController = require('../Controllers/gameController');
const { protect, restrictTo } = require('../middleware/advancedAuth');
const { verificationLimiter } = require('../middleware/security');
const { validateGameVerification } = require('../middleware/validation');

// Public routes
router.get('/supported', gameController.getSupportedGames);

// Protected routes
router.use(protect);

router.post('/verify-stats', 
  verificationLimiter, 
  validateGameVerification, 
  gameController.verifyPlayerStats
);

router.get('/verifications/:userId', gameController.getVerificationHistory);
router.post('/proofs/:proofId/reverify', gameController.reverifyProof);

// Admin only routes
router.get('/admin/fraud-reports', 
  restrictTo('admin'), 
  gameController.getFraudReports
);

module.exports = router;