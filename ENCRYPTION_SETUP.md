# Token Encryption Setup

## Overview

This application encrypts sensitive OAuth tokens (Google Calendar, etc.) at rest using AES-256-GCM encryption. This protects tokens from unauthorized access if the filesystem is compromised.

## Initial Setup

### 1. Generate Encryption Key

Generate a secure 256-bit encryption key:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

### 2. Add to Environment Variables

Add the generated key to your `.env` file:

```bash
ENCRYPTION_SECRET=your-generated-key-here
```

**⚠️ IMPORTANT:** 
- Never commit this key to git
- Store it securely (password manager, secrets manager)
- Losing this key means you cannot decrypt existing tokens

## How It Works

### Encryption
- Uses AES-256-GCM (authenticated encryption)
- Each token file gets a unique random IV (initialization vector)
- Includes authentication tag to detect tampering
- Format: `iv.authTag.ciphertext` (base64-encoded)

### Token Storage
When `saveTokens()` is called:
1. Tokens are JSON-stringified
2. Encrypted using `ENCRYPTION_SECRET`
3. Saved as encrypted text (not JSON)

When `loadTokens()` is called:
1. File contents are read
2. Decrypted using `ENCRYPTION_SECRET`
3. Parsed back to JSON object

### Migration from Unencrypted Tokens

The system automatically handles migration:
- Old unencrypted token files are detected and loaded normally
- A warning is logged to console
- Next time tokens are saved (e.g., after refresh), they're encrypted
- No manual migration required

## Security Best Practices

### Development
```bash
# .env file (local only - not committed)
ENCRYPTION_SECRET=your-dev-key
```

### Production
Use a proper secrets management system:
- Azure Key Vault
- AWS Secrets Manager
- HashiCorp Vault
- Environment variables in hosting platform

### Key Rotation
To rotate the encryption key:

1. Generate new key
2. Add as `ENCRYPTION_SECRET_NEW` to environment
3. Update `encryption.js` to read old and new keys
4. Decrypt all tokens with old key, re-encrypt with new key
5. Replace `ENCRYPTION_SECRET` with new key
6. Remove `ENCRYPTION_SECRET_NEW`

## Verification

Test encryption is working:

```powershell
# Add a test account
node manage-accounts.js add test

# Check token file is encrypted (should see base64 gibberish, not JSON)
cat google-accounts/tokens-test.json

# Load account should work normally
node test-calendar.js test
```

## Troubleshooting

### Error: "ENCRYPTION_SECRET environment variable is required"
- Add `ENCRYPTION_SECRET` to your `.env` file
- Restart the application after adding

### Error: "Invalid encrypted data format"
- Token file may be corrupted
- Delete the token file and re-authenticate the account

### Tokens not decrypting after key change
- If you changed `ENCRYPTION_SECRET`, existing encrypted tokens are unrecoverable
- Delete token files and re-authenticate all accounts
- This is why key management/backup is critical

## What's Encrypted

✅ **Encrypted:**
- OAuth access tokens (`tokens-*.json`)
- OAuth refresh tokens
- Token expiration timestamps

❌ **Not Encrypted:**
- Account metadata (`accounts.json`) - contains only non-sensitive info (names, IDs)
- Application credentials in `.env` (should use secrets manager in production)

## Files

- `encryption.js` - Encryption utilities (encrypt, decrypt, isEncrypted)
- `google-account-manager.js` - Updated to use encryption for token storage
- `.gitignore` - Ensures `google-accounts/tokens-*.json` never committed
