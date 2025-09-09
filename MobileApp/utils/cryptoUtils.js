const crypto = require('crypto');
const { fromBech32, toBech32 } = require('@cosmjs/encoding');
const { verifyADR36Amino } = require('@keplr-wallet/cosmos');

// Validate XION wallet address
const isValidXionAddress = (address) => {
  try {
    const { prefix, data } = fromBech32(address);
    return prefix === 'xion' && data.length === 20;
  } catch {
    return false;
  }
};

// Verify wallet signature for XION
const validateWalletSignature = async (walletAddress, message, signature, chainId) => {
  try {
    if (!isValidXionAddress(walletAddress)) {
      throw new Error('Invalid XION wallet address');
    }

    // Verify the signature using Cosmos signature verification
    const isValid = verifyADR36Amino(
      'xion',
      walletAddress,
      message,
      Buffer.from(signature, 'base64'),
      'secp256k1'
    );

    return isValid;
  } catch (error) {
    console.error('Wallet signature verification failed:', error);
    return false;
  }
};

// Generate challenge message for wallet connection
const generateWalletChallenge = (userId, timestamp = Date.now()) => {
  const nonce = crypto.randomBytes(16).toString('hex');
  return {
    message: `Sign this message to verify your wallet ownership.\n\nUser ID: ${userId}\nTimestamp: ${timestamp}\nNonce: ${nonce}`,
    nonce,
    timestamp
  };
};

// Hash sensitive data
const hashData = (data, algorithm = 'sha256') => {
  return crypto.createHash(algorithm).update(JSON.stringify(data)).digest('hex');
};

// Generate secure random string
const generateSecureToken = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

// Encrypt/Decrypt sensitive data
const encrypt = (text, key = process.env.ENCRYPTION_KEY) => {
  const algorithm = 'aes-256-gcm';
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipher(algorithm, key);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  return {
    encrypted,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex')
  };
};

const decrypt = (encryptedData, key = process.env.ENCRYPTION_KEY) => {
  const algorithm = 'aes-256-gcm';
  const decipher = crypto.createDecipher(algorithm, key);
  
  decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));
  
  let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
};

module.exports = {
  isValidXionAddress,
  validateWalletSignature,
  generateWalletChallenge,
  hashData,
  generateSecureToken,
  encrypt,
  decrypt
};