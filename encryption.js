// Encryption utility for sensitive data
import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16;  // 128 bits
const AUTH_TAG_LENGTH = 16;

/**
 * Derive an encryption key from the environment variable
 * @returns {Buffer} 256-bit encryption key
 */
function getEncryptionKey() {
  const secret = process.env.ENCRYPTION_SECRET;
  
  if (!secret) {
    throw new Error(
      'ENCRYPTION_SECRET environment variable is required. ' +
      'Generate one with: node -e "console.log(crypto.randomBytes(32).toString(\'base64\'))"'
    );
  }
  
  // Use PBKDF2 to derive a consistent key from the secret
  return crypto.pbkdf2Sync(secret, 'discord-secretary-salt', 100000, KEY_LENGTH, 'sha256');
}

/**
 * Encrypt data using AES-256-GCM
 * @param {string} plaintext - data to encrypt
 * @returns {string} encrypted data in format: iv.authTag.ciphertext (base64)
 */
export function encrypt(plaintext) {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let ciphertext = cipher.update(plaintext, 'utf8', 'base64');
  ciphertext += cipher.final('base64');
  
  const authTag = cipher.getAuthTag();
  
  // Return as: iv.authTag.ciphertext (all base64 encoded)
  return [
    iv.toString('base64'),
    authTag.toString('base64'),
    ciphertext
  ].join('.');
}

/**
 * Decrypt data encrypted with encrypt()
 * @param {string} encrypted - encrypted data in format: iv.authTag.ciphertext
 * @returns {string} decrypted plaintext
 */
export function decrypt(encrypted) {
  const key = getEncryptionKey();
  
  const parts = encrypted.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }
  
  const [ivB64, authTagB64, ciphertext] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let plaintext = decipher.update(ciphertext, 'base64', 'utf8');
  plaintext += decipher.final('utf8');
  
  return plaintext;
}

/**
 * Check if data appears to be encrypted (basic format check)
 * @param {string} data - data to check
 * @returns {boolean} true if data looks encrypted
 */
export function isEncrypted(data) {
  if (typeof data !== 'string') return false;
  const parts = data.split('.');
  return parts.length === 3 && parts.every(part => part.length > 0);
}
