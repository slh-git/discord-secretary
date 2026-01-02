# Calendar Integration with Multi-Account OAuth2 Support

This plan sets up SQLite database with encrypted token storage, implements OAuth2 flows for Google Calendar and Microsoft Outlook Calendar APIs with multi-account support, and syncs all calendars per account through the Discord bot.

## Steps

1. **Install dependencies** — Add `better-sqlite3` (SQLite), `googleapis` (Google Calendar API), `@microsoft/microsoft-graph-client` (Microsoft Graph API), and Node.js built-in `crypto` module for encryption

2. **Create database schema** — Create `database.js` with tables: `users` (id, discord_id, created_at), `calendar_accounts` (id, user_id, provider [google/microsoft], email, encrypted_access_token, encrypted_refresh_token, token_expiry, created_at, updated_at) with one-to-many relationship

3. **Build encryption utilities** — Add encryption/decryption functions in `database.js` using `crypto.createCipheriv()` with AES-256-CBC, storing encryption key in `.env` as `ENCRYPTION_KEY` (generate via `crypto.randomBytes(32).toString('hex')`)

4. **Add OAuth2 callback endpoints** — Create routes in `app.js`: `GET /oauth/google/callback` and `GET /oauth/microsoft/callback` to handle authorization codes, exchange for tokens, encrypt and store in `calendar_accounts` table

5. **Create calendar connection commands** — Add `/connect-google` and `/connect-microsoft` commands in `commands.js` that return ephemeral messages with link buttons (style 5) pointing to OAuth2 authorization URLs with proper scopes (`https://www.googleapis.com/auth/calendar.readonly` for Google, `Calendars.Read` for Microsoft)

6. **Implement token refresh logic** — Create `refreshTokenIfNeeded()` function in new `calendar.js` module that checks `token_expiry`, automatically refreshes expired tokens using refresh_token, and updates database with new encrypted tokens

7. **Build calendar sync functions** — Create `syncGoogleCalendars()` and `syncMicrosoftCalendars()` in `calendar.js` that fetch all calendars per account using the APIs and return unified event data structure

## Further Considerations

1. **OAuth state parameter** — Should include Discord user ID in OAuth state parameter to associate callback with correct user. Generate cryptographically secure state token, store temporarily (in-memory Map with TTL or Redis), verify on callback to prevent CSRF attacks.

2. **Credential setup** — Google Cloud Console requires creating OAuth2 Client ID with redirect URI `https://<your-domain>/oauth/google/callback`. Microsoft Azure requires app registration with redirect URI `https://<your-domain>/oauth/microsoft/callback`. Both need to be added to `.env` as `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`.

3. **Account management** — Add `/list-calendars` command showing connected accounts and `/disconnect` command with select menu to remove specific calendar accounts. Should delete from `calendar_accounts` table.

4. **Error handling on callbacks** — OAuth callbacks can fail (user denies, invalid code, expired state). Return user-friendly HTML page explaining error, or redirect to Discord with error message via interaction followup.

## Requirements (from discussion)

- **OAuth callback hosting**: Same Express server
- **Token security**: Encrypted in database
- **Multi-account support**: Yes (one-to-many relationship)
- **Calendar sync**: Sync all calendars per account