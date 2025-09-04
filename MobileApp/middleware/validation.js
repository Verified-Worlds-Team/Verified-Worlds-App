const { body, validationResult } = require('express-validator');

const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

const validateGameVerification = [
  body('game')
    .isIn(['league_of_legends', 'valorant', 'counter_strike'])
    .withMessage('Unsupported game'),
  body('gameAccount')
    .isLength({ min: 3, max: 50 })
    .withMessage('Game account must be 3-50 characters'),
  body('questId')
    .isInt({ min: 1 })
    .withMessage('Valid quest ID required'),
  handleValidationErrors
];

const validateUserRegistration = [
  body('username')
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be 3-30 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores'),
  body('email')
    .isEmail()
    .withMessage('Valid email required'),
  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain uppercase, lowercase, and number'),
  handleValidationErrors
];

module.exports = {
  validateGameVerification,
  validateUserRegistration,
  handleValidationErrors
};
