# Google Accounts Storage

This directory stores OAuth tokens for multiple Google accounts.

## Structure

- `accounts.json` - Maps account IDs to their metadata (name, email, etc.)
- `tokens-{accountId}.json` - OAuth tokens for each account

## Account IDs

Account IDs are short, URL-safe identifiers (e.g., "work", "personal", "client1")
