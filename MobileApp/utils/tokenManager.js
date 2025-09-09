const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const generateAccessToken = (user) => {
  return jwt.sign(
    {
      userId: user.userId,
      username: user.username,
      role: user.role,
      isVerified: user.isVerified
    },
    process.env.JWT_ACCESS_SECRET,
    { 
      expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
      issuer: 'game-verifier',
      audience: 'game-verifier-clients'
    }
  );
};

const generateRefreshToken = (user) => {
  return jwt.sign(
    { userId: user.userId, tokenId: crypto.randomUUID() },
    process.env.JWT_REFRESH_SECRET,
    { 
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
      issuer: 'game-verifier',
      audience: 'game-verifier-clients'
    }
  );
};

const generateTokens = (user) => {
  return {
    accessToken: generateAccessToken(user),
    refreshToken: generateRefreshToken(user)
  };
};

const verifyAccessToken = (token) => {
  return jwt.verify(token, process.env.JWT_ACCESS_SECRET, {
    issuer: 'game-verifier',
    audience: 'game-verifier-clients'
  });
};

const verifyRefreshToken = (token) => {
  return jwt.verify(token, process.env.JWT_REFRESH_SECRET, {
    issuer: 'game-verifier',
    audience: 'game-verifier-clients'
  });
};

module.exports = {
  generateTokens,
  verifyAccessToken,
  verifyRefreshToken
};