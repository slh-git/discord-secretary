# Google Calendar Multi-Account Setup

This project now supports managing multiple Google Calendar accounts simultaneously.

## Quick Start

### 1. Migrate Existing Token (If You Have One)

If you already have a `google-tokens.json` file:

```bash
node migrate-tokens.js [accountId]
```

Example:
```bash
node migrate-tokens.js personal
```

If no `accountId` is provided, it defaults to "default".

### 2. Add a New Account

```bash
node manage-accounts.js add <accountId>
```

Example:
```bash
node manage-accounts.js add work
```

You'll be prompted to enter optional details:
- Display name
- Email address
- Description

### 3. Authorize the Account

```bash
node test-calendar.js <accountId>
```

This will:
1. Open a browser for OAuth authorization
2. Save the tokens securely
3. Display your calendars and upcoming events

### 4. List All Accounts

```bash
node manage-accounts.js list
```

### 5. View Account Details

```bash
node manage-accounts.js info <accountId>
```

Shows account metadata and authorization status.

### 6. Remove an Account

```bash
node manage-accounts.js remove <accountId>
```

Removes the account and deletes its tokens (asks for confirmation).

## File Structure

```
google-accounts/
├── accounts.json              # Registry of all accounts
├── tokens-personal.json       # OAuth tokens for "personal" account
├── tokens-work.json          # OAuth tokens for "work" account
└── tokens-client1.json       # OAuth tokens for "client1" account
```

## Account IDs

Account IDs should be:
- Short and memorable (e.g., "work", "personal", "client1")
- URL-safe (letters, numbers, hyphens, underscores)
- Unique across your setup

## Common Workflows

### Adding Multiple Work Accounts

```bash
# Add company account
node manage-accounts.js add company
node test-calendar.js company

# Add personal account
node manage-accounts.js add personal
node test-calendar.js personal

# Add client account
node manage-accounts.js add client-acme
node test-calendar.js client-acme
```

### Checking Which Accounts Are Authorized

```bash
node manage-accounts.js list
```

Look for the authorization status in the output.

### Re-authorizing an Account

If tokens expire or you need to re-authorize:

```bash
node test-calendar.js <accountId>
```

The OAuth flow will prompt for consent again.

## Security Notes

- Tokens are stored in `google-accounts/tokens-*.json`
- These files are gitignored by default
- Each account's tokens are isolated
- Never commit token files to version control

## Troubleshooting

### "Account not found" error

Make sure you've added the account first:
```bash
node manage-accounts.js add <accountId>
```

### OAuth callback not working

Ensure:
1. Redirect URI in Google Console is `http://localhost:3000/oauth2callback`
2. Port 3000 is not in use by another application
3. You're clicking the authorization link in the same browser session

### Tokens expired

Refresh tokens are used automatically. If you see errors, re-authorize:
```bash
node test-calendar.js <accountId>
```

## Next Steps

- Update your Discord bot commands to accept account ID parameter
- Create commands like `/calendar <account>` to query specific accounts
- Store user preferences for default account in Discord user settings
