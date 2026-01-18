# Google Calendar Integration - Technical Documentation

## Table of Contents
1. [Big Picture Overview](#big-picture-overview)
2. [Must-Know Concepts](#must-know-concepts)
3. [Architecture & Data Flow](#architecture--data-flow)
4. [Implementation Details](#implementation-details)
5. [Configuration & Setup](#configuration--setup)
6. [Testing & Troubleshooting](#testing--troubleshooting)

---

## Big Picture Overview

### What Does This Feature Do?
This integration allows Discord users to view their upcoming Google Calendar events directly through a Discord bot command (`/gcalendar`). The bot authenticates with Google using OAuth 2.0, stores the user's credentials securely, and fetches calendar data on demand.

### Why OAuth 2.0?
Google Calendar API requires OAuth 2.0 authentication because:
- **Security**: Users don't share passwords with the bot
- **Scope Control**: We only request read-only calendar access
- **Token Management**: Refresh tokens allow long-term access without re-authentication
- **User Control**: Users can revoke access anytime from their Google account

### Key Components
```
┌─────────────────┐
│  Discord User   │
│  runs /gcalendar│
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│         Discord Bot (start-manager)      │
│  ┌─────────────┐      ┌──────────────┐  │
│  │  Bot Logic  │◄────►│  API Server  │  │
│  │  (Command)  │      │  (OAuth)     │  │
│  └─────────────┘      └──────────────┘  │
└──────────┬──────────────────┬───────────┘
           │                  │
           ▼                  ▼
    ┌─────────────┐    ┌─────────────┐
    │   Google    │    │   Token     │
    │  Calendar   │    │   Storage   │
    │     API     │    │ (JSON file) │
    └─────────────┘    └─────────────┘
```

---

## Must-Know Concepts

### 1. OAuth 2.0 Flow (Authorization Code Grant)
This is a three-step dance between the user, our bot, and Google:

**Step 1: Authorization Request**
- User clicks auth link with `client_id`, `scope`, `redirect_uri`
- Google shows consent screen asking user to grant permissions

**Step 2: Authorization Code Exchange**
- User approves → Google redirects to `redirect_uri` with a `code`
- Our bot exchanges this `code` for `access_token` and `refresh_token`

**Step 3: API Calls**
- Bot uses `access_token` to make Calendar API requests
- When `access_token` expires, use `refresh_token` to get a new one

### 2. Token Types

| Token Type | Purpose | Lifespan | Storage |
|------------|---------|----------|---------|
| **Authorization Code** | One-time code to get tokens | 10 minutes | Not stored (used immediately) |
| **Access Token** | Used in API requests | 1 hour | `config/google-tokens.json` |
| **Refresh Token** | Gets new access tokens | Long-lived* | `config/google-tokens.json` |

*Refresh tokens can last indefinitely but may expire if unused for 6 months or if user revokes access.

### 3. Scopes
We request: `https://www.googleapis.com/auth/calendar.readonly`
- **Read-only access** to user's calendar
- Cannot create/edit/delete events
- Principle of least privilege

### 4. Why Two Servers? (Bot vs Manager)

**start-bot.js** - Simple bot instance
- Handles Discord commands
- No HTTP server
- Used for testing single instances

**start-manager.js** - Production setup
- Includes sharding for scaling
- Runs Express API server (port 3001)
- Handles OAuth callbacks via HTTP endpoints
- This is what we're using for Calendar integration

---

## Architecture & Data Flow

### File Structure
```
discord-secretary/
├── src/
│   ├── commands/
│   │   └── chat/
│   │       └── gcalendar-command.ts    ← Discord command handler
│   ├── controllers/
│   │   ├── oauth-controller.ts         ← NEW: OAuth callback handler
│   │   └── index.ts                    ← Export OAuth controller
│   ├── models/
│   │   └── config-models.ts            ← Added GCalendarConfig interface
│   ├── start-manager.ts                ← Modified: Added OAuth controller to API
│   └── start-bot.ts                    ← Modified: Added GCalendarCommand
├── config/
│   ├── config.json                     ← Google OAuth credentials
│   └── google-tokens.json              ← NEW: Stored user tokens (auto-created)
└── lang/
    ├── lang.en-US.json                 ← Added gcalendar strings
    └── lang.en-GB.json                 ← Added gcalendar strings
```

### Complete User Flow

```
1. User types /gcalendar in Discord
   │
   ├─► [gcalendar-command.ts] execute() called
   │   │
   │   ├─► Check if config/google-tokens.json exists
   │   │   │
   │   │   ├─► NO: Generate auth URL, send embed with link
   │   │   │        User clicks link → Google consent screen
   │   │   │        User approves → Redirect to http://localhost:3001/oauth/callback?code=...
   │   │   │        │
   │   │   │        ├─► [oauth-controller.ts] callback() handles request
   │   │   │        │   │
   │   │   │        │   ├─► Extract code from query param
   │   │   │        │   ├─► Exchange code for tokens (oauth2Client.getToken)
   │   │   │        │   ├─► Save tokens to config/google-tokens.json
   │   │   │        │   └─► Show success HTML page
   │   │   │        │
   │   │   │        └─► User returns to Discord, runs /gcalendar again
   │   │   │
   │   │   └─► YES: Load tokens from file
   │   │            Set credentials (oauth2Client.setCredentials)
   │   │            │
   │   │            ├─► Create Calendar API client
   │   │            ├─► Fetch events (calendar.events.list)
   │   │            ├─► Build Discord embed with events
   │   │            └─► Send embed to user
   │   │
   │   └─► Error handling: catch block sends error embed
   │
   └─► Command complete
```

---

## Implementation Details

### 1. Command Implementation (`gcalendar-command.ts`)

**Design Decisions:**

#### Why use `createRequire` for config?
```typescript
const require = createRequire(import.meta.url);
let Config = require('../../../config/config.json');
```
- We're using ES modules (`import`/`export`), but JSON imports are tricky
- `createRequire` bridges CommonJS-style `require` in an ES module
- Ensures consistent config loading pattern with rest of codebase

#### Why check for token file with try-catch?
```typescript
try {
    const tokenData = await fs.readFile(TOKEN_PATH, 'utf-8');
    const tokens = JSON.parse(tokenData);
    oauth2Client.setCredentials(tokens);
} catch (error) {
    // No tokens found, need to authorize
    const authUrl = oauth2Client.generateAuthUrl({...});
    // Send auth link to user
    return;
}
```
**Reasoning:**
- **EAFP** (Easier to Ask Forgiveness than Permission) pattern
- Attempting to read the file is faster than checking existence first
- If file doesn't exist or is corrupt, we handle it the same way: re-authorize
- Keeps the happy path (tokens exist) as the main code flow

#### Why `access_type: 'offline'`?
```typescript
const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',  // ← Important!
    scope: SCOPES,
});
```
- `offline` tells Google to provide a **refresh token**
- Without this, we'd only get an access token (expires in 1 hour)
- Refresh tokens allow long-term access without user re-authentication

#### Event Parsing Logic
```typescript
const start = event.start?.dateTime ?? event.start?.date;
```
- Google Calendar events can be **all-day** or **timed**
- All-day events have `event.start.date` (e.g., "2026-01-20")
- Timed events have `event.start.dateTime` (e.g., "2026-01-20T14:00:00-05:00")
- `??` (nullish coalescing) checks both, prefers dateTime

---

### 2. OAuth Controller (`oauth-controller.ts`)

**Purpose:** Handle the OAuth redirect from Google after user authorization.

#### Why Express Controller Pattern?
```typescript
export class OAuthController implements Controller {
    public path = '/oauth';
    public router: Router = Router();
    
    public register(): void {
        this.router.get('/callback', (req, res) => this.callback(req, res));
    }
}
```
**Reasoning:**
- Consistent with existing controller architecture (GuildsController, ShardsController)
- Auto-registers routes when added to API
- Easy to extend with additional OAuth routes later (e.g., `/oauth/revoke`)

#### Token Exchange Process
```typescript
const { tokens } = await oauth2Client.getToken(code);
await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2));
```

**What's in `tokens`?**
```json
{
  "access_token": "ya29.a0AfH6SMB...",
  "refresh_token": "1//0gL8...",
  "scope": "https://www.googleapis.com/auth/calendar.readonly",
  "token_type": "Bearer",
  "expiry_date": 1705456789000
}
```

**Security Consideration:**
- Tokens saved to `config/` which is in `.gitignore`
- File permissions should be restricted in production
- For multi-user bots, use a database with encrypted token storage

#### HTML Response Pattern
```typescript
res.status(200).send(`
    <html>
        <head><title>Authorization Successful</title></head>
        <body style="...">
            <h1 style="color: #4285F4;">✅ Authorization Successful!</h1>
            ...
        </body>
    </html>
`);
```
**Why inline HTML?**
- Simple success/error feedback without frontend framework
- User immediately knows auth worked
- Provides clear instruction to return to Discord
- Production apps might redirect to a proper frontend

---

### 3. Manager Integration (`start-manager.ts`)

#### Adding OAuth Controller to API
```typescript
import { GuildsController, OAuthController, RootController, ShardsController } from './controllers/index.js';

// ... later in code ...

let oauthController = new OAuthController();
let api = new Api([guildsController, shardsController, oauthController, rootController]);
```

**Why manager and not bot?**
- `start-manager.ts` already runs an Express API server on port 3001
- `start-bot.ts` is a simple bot without HTTP server
- OAuth requires HTTP endpoint to receive callbacks
- Manager is production setup, handles clustering/sharding

**API Architecture:**
```typescript
class Api {
    constructor(private controllers: Controller[]) {
        // Express app setup
        this.controllers.forEach(controller => {
            controller.register();
            this.app.use(controller.path, controller.router);
        });
    }
}
```
- Each controller defines its base path (e.g., `/oauth`)
- Controllers register their own routes (e.g., `/callback`)
- Final URL: `http://localhost:3001/oauth/callback`

---

### 4. Configuration Setup

#### Config Structure (`config/config.json`)
```json
{
  "gCalendar": {
    "client_id": "1018864800731-...apps.googleusercontent.com",
    "project_id": "our-mechanism-476320-h7",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://oauth2.googleapis.com/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_secret": "GOCSPX-...",
    "redirect_uris": ["http://localhost:3001/oauth/callback"]
  }
}
```

**Key Fields:**
- **client_id**: Public identifier for your Google Cloud project
- **client_secret**: Secret key (treat like a password!)
- **redirect_uris**: Must match EXACTLY what's in Google Cloud Console
- **Other URIs**: Used by Google OAuth library internally

#### TypeScript Interface (`config-models.ts`)
```typescript
export interface GCalendarConfig {
    client_id: string;
    project_id: string;
    auth_uri: string;
    token_uri: string;
    auth_provider_x509_cert_url: string;
    client_secret: string;
    redirect_uris: string[];
}
```
**Purpose:**
- Type safety when accessing `Config.gCalendar`
- Documents expected structure
- IDE autocomplete support

---

### 5. Localization (`lang/` files)

#### Added Strings
```json
{
  "chatCommands": {
    "gcalendar": "gcalendar"
  },
  "commandDescs": {
    "gcalendar": "View upcoming Google Calendar events."
  }
}
```

**Why Localization?**
- Bot template uses Linguini for i18n
- All user-facing strings must be in lang files
- Supports multiple languages (en-US, en-GB, etc.)
- Discord command names can be localized per region

**Common Pattern:**
```typescript
Lang.getRef('chatCommands.gcalendar', Language.Default)
// Returns: "gcalendar"

Lang.getRefLocalizationMap('chatCommands.gcalendar')
// Returns: { "en-US": "gcalendar", "en-GB": "gcalendar", ... }
```

---

## Configuration & Setup

### Google Cloud Console Setup

#### 1. Create Project & Enable API
```
1. Go to console.cloud.google.com
2. Create new project or select existing
3. Navigate to "APIs & Services" > "Library"
4. Search "Google Calendar API"
5. Click "Enable"
```

#### 2. Configure OAuth Consent Screen
```
1. "APIs & Services" > "OAuth consent screen"
2. Choose "External" (for public bot) or "Internal" (for workspace)
3. Fill required fields:
   - App name: "Discord Calendar Bot"
   - User support email: your-email@example.com
   - Developer contact: your-email@example.com
4. Add scope: .../auth/calendar.readonly
5. Add test users (during development)
6. Save and continue
```

#### 3. Create OAuth Credentials
```
1. "APIs & Services" > "Credentials"
2. "Create Credentials" > "OAuth 2.0 Client ID"
3. Application type: "Web application"
4. Authorized redirect URIs:
   - http://localhost:3001/oauth/callback
   - https://your-domain.com/oauth/callback (for production)
5. Download JSON or copy credentials
6. Add to config/config.json under "gCalendar"
```

### Local Development Setup

```bash
# 1. Install dependencies (already done)
npm install

# 2. Update config/config.json with Google credentials

# 3. Build TypeScript
npm run build

# 4. Register Discord commands
npm run commands:register

# 5. Start the manager (includes API + Bot)
npm run start:manager

# Bot is now running on http://localhost:3001
```

### Production Considerations

#### Security Checklist
- [ ] Store `client_secret` in environment variables, not config.json
- [ ] Use HTTPS for redirect URI (not http)
- [ ] Implement per-user token storage (database)
- [ ] Add token encryption at rest
- [ ] Set proper file permissions on token storage
- [ ] Implement token refresh logic before expiry
- [ ] Add rate limiting to OAuth endpoint
- [ ] Log OAuth attempts for security monitoring

#### Scaling to Multi-User
Current implementation stores ONE user's tokens globally. For multi-user:

```typescript
// Instead of:
config/google-tokens.json

// Use database:
┌──────────┬────────────────┬──────────────┬───────────────┐
│ user_id  │ access_token   │ refresh_token│ expiry_date   │
├──────────┼────────────────┼──────────────┼───────────────┤
│ 12345... │ ya29.a0AfH6... │ 1//0gL8...   │ 1705456789000 │
│ 67890... │ ya29.a0Bfx9... │ 1//0hM2...   │ 1705460123000 │
└──────────┴────────────────┴──────────────┴───────────────┘
```

**Workflow Changes:**
1. Each Discord user gets unique auth link with `state` parameter containing their user ID
2. OAuth callback associates tokens with that user ID
3. Command checks: "Do I have tokens for THIS Discord user?"
4. Fetch events using user-specific tokens

---

## Testing & Troubleshooting

### Testing Checklist

#### ✅ First-Time Authorization Flow
```
1. Delete config/google-tokens.json (if exists)
2. Run /gcalendar in Discord
3. Verify: Receive embed with authorization link
4. Click link
5. Verify: Google consent screen appears
6. Grant access
7. Verify: Redirected to success page
8. Check: config/google-tokens.json created
9. Run /gcalendar again
10. Verify: See calendar events
```

#### ✅ Authenticated Flow
```
1. Ensure config/google-tokens.json exists
2. Run /gcalendar in Discord
3. Verify: Immediately see calendar events (no auth link)
4. Check event formatting (dates, titles)
```

#### ✅ Empty Calendar
```
1. Clear all events from Google Calendar
2. Run /gcalendar
3. Verify: "No upcoming events found" message
```

### Common Issues

#### Issue: "Command not found in Discord"
**Cause:** Commands not registered or Discord cache
**Solution:**
```bash
npm run commands:register  # Re-register
# Then: Restart Discord client completely
```

#### Issue: "Invalid redirect_uri"
**Cause:** Mismatch between config and Google Cloud Console
**Solution:**
```
1. Check config.json: "redirect_uris": ["http://localhost:3001/oauth/callback"]
2. Check Google Console: Authorized redirect URIs must match EXACTLY
3. No trailing slashes
4. http vs https must match
5. Port must match
```

#### Issue: "Tokens expired" or "Invalid credentials"
**Cause:** Access token expired and no refresh token
**Solution:**
```bash
# Delete tokens and re-authorize
rm config/google-tokens.json
# Run /gcalendar and authorize again
```

**Why this happens:**
- Initial auth with `access_type: 'online'` (we use 'offline')
- User revoked access in Google account settings
- Refresh token expired (6 months inactive)

#### Issue: "API started on port 3001" but OAuth doesn't work
**Cause:** Using `start:bot` instead of `start:manager`
**Solution:**
```bash
# Wrong: npm run start (or npm run start:bot)
# Correct:
npm run start:manager
```
- Only `start:manager` includes the API server
- `start:bot` is a simple bot without HTTP endpoints

#### Issue: OAuth callback shows blank page
**Cause:** Express not handling `/oauth/callback` route
**Check:**
1. OAuthController imported in start-manager.ts?
2. OAuthController added to Api([...]) array?
3. Manager actually running (not bot)?

**Debug:**
```bash
# Test API endpoint directly
curl http://localhost:3001/

# Should return:
{"name":"Discord Bot Cluster API","author":"Kevin Novak"}
```

### Debugging Tips

#### Enable Verbose Logging
```typescript
// In gcalendar-command.ts, add:
console.log('Token path:', TOKEN_PATH);
console.log('Tokens exist:', await fs.access(TOKEN_PATH).then(() => true).catch(() => false));
console.log('OAuth client configured:', !!oauth2Client);
```

#### Check Token File Manually
```bash
cat config/google-tokens.json
# Should show:
{
  "access_token": "ya29...",
  "refresh_token": "1//0g...",
  "expiry_date": 1705456789000
}
```

#### Test Google API Directly
```typescript
// Add temporary test endpoint in oauth-controller.ts
this.router.get('/test', async (req, res) => {
    const tokens = JSON.parse(await fs.readFile(TOKEN_PATH, 'utf-8'));
    res.json({ tokens, hasRefreshToken: !!tokens.refresh_token });
});

// Visit: http://localhost:3001/oauth/test
```

---

## Why This Approach?

### Design Decisions Recap

**1. File-based token storage** (instead of database)
- ✅ Simple for single-user testing
- ✅ No additional dependencies
- ✅ Easy to inspect/debug
- ❌ Doesn't scale to multiple users
- 🔄 **Recommendation:** Migrate to database for production

**2. Manager-based architecture** (instead of standalone OAuth server)
- ✅ Reuses existing Express API
- ✅ Same process as bot = simpler deployment
- ✅ Shared configuration and logging
- ❌ OAuth endpoint scales with bot shards (probably fine)

**3. OAuth 2.0 Authorization Code Flow** (not service account)
- ✅ Users control their own data
- ✅ Users can revoke access
- ✅ No need for domain-wide delegation
- ✅ Follows OAuth best practices
- ❌ More complex than API key
- ❌ Requires user interaction

**4. googleapis npm package** (instead of raw HTTP)
- ✅ Handles token refresh automatically
- ✅ Type definitions included
- ✅ Well-maintained by Google
- ✅ Abstracts OAuth complexity
- ❌ Larger dependency size

---

## Next Steps & Enhancements

### Immediate Improvements
1. **Add token refresh logic**
   ```typescript
   // Before API call, check expiry
   if (tokens.expiry_date < Date.now()) {
       const newTokens = await oauth2Client.refreshAccessToken();
       await fs.writeFile(TOKEN_PATH, JSON.stringify(newTokens.credentials));
   }
   ```

2. **Add command options**
   ```typescript
   // metadata.ts
   options: [
       {
           name: 'days',
           description: 'Number of days to look ahead',
           type: ApplicationCommandOptionType.Integer,
           required: false,
           min_value: 1,
           max_value: 30
       }
   ]
   ```

3. **Improve error messages**
   ```typescript
   if (error.code === 401) {
       return 'Your authorization has expired. Please run /gcalendar to re-authorize.';
   }
   ```

### Advanced Features
- **Multiple calendar support** (not just 'primary')
- **Event filtering** (by keyword, calendar ID)
- **Recurring event handling** (show next occurrence only)
- **Timezone awareness** (convert to user's timezone)
- **Event reminders** (DM user X minutes before event)
- **Create events from Discord** (requires write scope)

### Production Readiness
1. **Multi-user support** with database
2. **Token encryption** at rest
3. **Environment variable config** (12-factor app)
4. **Monitoring & alerting** for OAuth failures
5. **Rate limiting** on OAuth endpoints
6. **HTTPS** redirect URIs with domain
7. **Webhook integration** (push notifications from Google)

---

## Additional Resources

### Documentation Links
- [Google Calendar API Docs](https://developers.google.com/calendar/api/v3/reference)
- [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)
- [googleapis npm package](https://www.npmjs.com/package/googleapis)
- [Discord.js Guide](https://discordjs.guide/)

### Related Files to Study
- `src/commands/chat/help-command.ts` - Similar command structure
- `src/controllers/guilds-controller.ts` - Controller pattern example
- `src/services/command-registration-service.ts` - How commands are registered
- `src/events/command-handler.ts` - How commands are executed

### Key Concepts to Understand
1. **OAuth 2.0 flows** (authorization code, implicit, client credentials)
2. **JWT tokens** (what's inside an access token)
3. **Express.js routing** (middleware, routes, controllers)
4. **Discord.js interactions** (commands, embeds, deferrals)
5. **TypeScript async/await** (promises, error handling)
6. **File I/O with fs/promises** (vs callback-based fs)

---

## Questions for Code Review

When reviewing this code with your team, consider:

1. **Security**: Are tokens stored securely? What happens if the token file is leaked?
2. **Error Handling**: What if Google API is down? What if token refresh fails?
3. **User Experience**: Is the auth flow clear? Can we improve the redirect page?
4. **Scalability**: How would this work with 1000 concurrent users?
5. **Testing**: How do we write unit tests for OAuth flow?
6. **Monitoring**: How do we know if Calendar integration is failing?

---

## Conclusion

This Google Calendar integration demonstrates:
- ✅ OAuth 2.0 authorization code flow
- ✅ REST API integration with external services
- ✅ Token management and persistence
- ✅ Express controller architecture
- ✅ Discord command implementation
- ✅ Error handling and user feedback

**Key Takeaway:** OAuth is complex, but breaking it into components (command, controller, token storage) makes it manageable. Always think about the user flow first, then build the technical implementation around it.

**Remember:** This is a learning implementation. Production systems need additional security, scalability, and monitoring considerations.

---

*Last Updated: January 17, 2026*
*Author: Engineering Team*
*Version: 1.0.0*
