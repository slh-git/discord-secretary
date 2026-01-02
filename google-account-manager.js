// Utility for managing multiple Google Calendar accounts
import fs from 'fs/promises';
import path from 'path';
import { encrypt, decrypt, isEncrypted } from './encryption.js';

const ACCOUNTS_DIR = path.join(process.cwd(), 'google-accounts');
const ACCOUNTS_FILE = path.join(ACCOUNTS_DIR, 'accounts.json');

/**
 * Load the accounts registry
 * @returns {Promise<Object>} accounts object with account metadata
 */
export async function loadAccounts() {
  try {
    const data = await fs.readFile(ACCOUNTS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // Return empty structure if file doesn't exist
    return { accounts: {} };
  }
}

/**
 * Save the accounts registry
 * @param {Object} accountsData - accounts object to save
 */
export async function saveAccounts(accountsData) {
  await fs.writeFile(ACCOUNTS_FILE, JSON.stringify(accountsData, null, 2));
}

/**
 * Get path to tokens file for a specific account
 * @param {string} accountId - unique identifier for the account
 * @returns {string} path to tokens file
 */
export function getTokenPath(accountId) {
  return path.join(ACCOUNTS_DIR, `tokens-${accountId}.json`);
}

/**
 * Load OAuth tokens for a specific account
 * @param {string} accountId - unique identifier for the account
 * @returns {Promise<Object|null>} tokens object or null if not found
 */
export async function loadTokens(accountId) {
  try {
    const tokenPath = getTokenPath(accountId);
    const data = await fs.readFile(tokenPath, 'utf8');
    
    // Check if data is encrypted (supports migration from unencrypted)
    if (isEncrypted(data.trim())) {
      const decrypted = decrypt(data.trim());
      return JSON.parse(decrypted);
    } else {
      // Legacy unencrypted format - return as-is but log warning
      console.warn(`⚠️  Token file for '${accountId}' is not encrypted. Re-save to encrypt.`);
      return JSON.parse(data);
    }
  } catch (error) {
    if (error.message?.includes('ENCRYPTION_SECRET')) {
      throw error; // Re-throw encryption errors
    }
    return null;
  }
}

/**
 * Save OAuth tokens for a specific account (encrypted)
 * @param {string} accountId - unique identifier for the account
 * @param {Object} tokens - OAuth tokens to save
 */
export async function saveTokens(accountId, tokens) {
  const tokenPath = getTokenPath(accountId);
  const plaintext = JSON.stringify(tokens, null, 2);
  const encrypted = encrypt(plaintext);
  await fs.writeFile(tokenPath, encrypted, 'utf8');
  console.log(`💾 Tokens saved (encrypted) for account: ${accountId}`);
}

/**
 * Add or update an account in the registry
 * @param {string} accountId - unique identifier for the account
 * @param {Object} metadata - account metadata (name, email, etc.)
 */
export async function addAccount(accountId, metadata) {
  const accountsData = await loadAccounts();
  accountsData.accounts[accountId] = {
    ...metadata,
    addedAt: new Date().toISOString(),
  };
  await saveAccounts(accountsData);
  console.log(`✅ Account added: ${accountId}`);
}

/**
 * Remove an account and its tokens
 * @param {string} accountId - unique identifier for the account
 */
export async function removeAccount(accountId) {
  // Remove from registry
  const accountsData = await loadAccounts();
  delete accountsData.accounts[accountId];
  await saveAccounts(accountsData);
  
  // Delete tokens file
  try {
    const tokenPath = getTokenPath(accountId);
    await fs.unlink(tokenPath);
  } catch (error) {
    // Ignore if tokens file doesn't exist
  }
  
  console.log(`🗑️  Account removed: ${accountId}`);
}

/**
 * List all configured accounts
 * @returns {Promise<Array>} array of account objects with id and metadata
 */
export async function listAccounts() {
  const accountsData = await loadAccounts();
  return Object.entries(accountsData.accounts).map(([id, metadata]) => ({
    id,
    ...metadata,
  }));
}

/**
 * Get account metadata
 * @param {string} accountId - unique identifier for the account
 * @returns {Promise<Object|null>} account metadata or null if not found
 */
export async function getAccount(accountId) {
  const accountsData = await loadAccounts();
  return accountsData.accounts[accountId] || null;
}

/**
 * Check if an account exists
 * @param {string} accountId - unique identifier for the account
 * @returns {Promise<boolean>} true if account exists
 */
export async function accountExists(accountId) {
  const accountsData = await loadAccounts();
  return accountId in accountsData.accounts;
}
