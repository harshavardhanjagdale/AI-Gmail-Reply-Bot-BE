const crypto = require('crypto');

// Encryption key - should be stored in environment variable in production
// Generate a key with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY) {
  console.warn('⚠️  WARNING: ENCRYPTION_KEY not set in environment variables!');
  console.warn('⚠️  Using randomly generated key. This will cause decryption failures for existing encrypted data.');
  console.warn('⚠️  Set ENCRYPTION_KEY in your .env file to use a consistent encryption key.');
  console.warn('⚠️  Users with existing encrypted tokens will need to re-authenticate.');
}
const ACTUAL_ENCRYPTION_KEY = ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;

/**
 * Encrypts sensitive data (OAuth tokens)
 * @param {string} text - Plain text to encrypt
 * @returns {string} - Encrypted string (base64 encoded)
 */
function encrypt(text) {
  if (!text) return null;
  
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const salt = crypto.randomBytes(SALT_LENGTH);
    
    // Derive key from encryption key and salt
    const key = crypto.pbkdf2Sync(ACTUAL_ENCRYPTION_KEY, salt, 100000, 32, 'sha512');
    
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(text, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    const tag = cipher.getAuthTag();
    
    // Combine salt + iv + tag + encrypted data
    const combined = Buffer.concat([
      salt,
      iv,
      tag,
      Buffer.from(encrypted, 'base64')
    ]);
    
    return combined.toString('base64');
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypts encrypted data
 * @param {string} encryptedText - Encrypted string (base64 encoded)
 * @param {boolean} silent - If true, suppress error logging (default: false)
 * @returns {string} - Decrypted plain text
 */
function decrypt(encryptedText, silent = false) {
  if (!encryptedText) return null;
  
  try {
    const combined = Buffer.from(encryptedText, 'base64');
    
    // Extract components
    const salt = combined.slice(0, SALT_LENGTH);
    const iv = combined.slice(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
    const tag = combined.slice(SALT_LENGTH + IV_LENGTH, SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    const encrypted = combined.slice(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);
    
    // Derive key from encryption key and salt
    const key = crypto.pbkdf2Sync(ACTUAL_ENCRYPTION_KEY, salt, 100000, 32, 'sha512');
    
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    
    let decrypted = decipher.update(encrypted, null, 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    if (!silent) {
      console.error('Decryption error:', error);
    }
    throw new Error('Failed to decrypt data');
  }
}

/**
 * Encrypts an object's sensitive fields
 * @param {object} obj - Object to encrypt
 * @param {string[]} fields - Array of field names to encrypt
 * @returns {object} - Object with encrypted fields
 */
function encryptObject(obj, fields = ['access_token', 'refresh_token', 'id_token']) {
  if (!obj) return null;
  
  const encrypted = { ...obj };
  fields.forEach(field => {
    if (encrypted[field]) {
      encrypted[field] = encrypt(encrypted[field]);
    }
  });
  
  return encrypted;
}

/**
 * Decrypts an object's encrypted fields
 * @param {object} obj - Object to decrypt
 * @param {string[]} fields - Array of field names to decrypt
 * @returns {object} - Object with decrypted fields
 */
function decryptObject(obj, fields = ['access_token', 'refresh_token', 'id_token']) {
  if (!obj) return null;
  
  const decrypted = { ...obj };
  fields.forEach(field => {
    if (decrypted[field]) {
      try {
        decrypted[field] = decrypt(decrypted[field]);
      } catch (error) {
        console.warn(`Failed to decrypt field ${field}:`, error.message);
        // Keep encrypted value if decryption fails (might be already decrypted or corrupted)
      }
    }
  });
  
  return decrypted;
}

module.exports = {
  encrypt,
  decrypt,
  encryptObject,
  decryptObject
};

