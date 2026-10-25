import { OAuth2Client } from 'google-auth-library';
import { calendar } from 'googleapis/build/src/apis/calendar/index.js';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

/** Scopes: read calendar and create/edit events. */
export const SCOPES = [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events',
];

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const pendingOAuthStates = new Map<string, { userId: string; expiresAt: number }>();

export function isGoogleInvalidGrant(error: unknown): boolean {
    const e = error as {
        cause?: { message?: string };
        response?: { data?: { error?: string } };
        code?: string;
    };
    return (
        e?.cause?.message === 'invalid_grant' ||
        e?.response?.data?.error === 'invalid_grant' ||
        e?.code === 'invalid_grant'
    );
}

/**
 * Remove one user's saved OAuth tokens so the next successful callback writes fresh tokens.
 * The legacy global token file is intentionally never adopted for a user.
 */
export async function clearStoredTokens(userId: string): Promise<void> {
    try {
        await fs.unlink(userTokenPath(userId));
    } catch (err: unknown) {
        const code = (err as NodeJS.ErrnoException)?.code;
        if (code !== 'ENOENT') throw err;
    }
}

/**
 * Generate a unique OAuth state for CSRF protection bound to a user.
 */
export function generateOAuthState(userId: string): string {
    const state = randomUUID();
    pendingOAuthStates.set(state, { userId, expiresAt: Date.now() + OAUTH_STATE_TTL_MS });
    return state;
}

export function consumeOAuthState(state: string): string | undefined {
    const pending = pendingOAuthStates.get(state);
    pendingOAuthStates.delete(state);
    if (!pending || pending.expiresAt < Date.now()) return undefined;
    return pending.userId;
}

/**
 * Build the Google OAuth URL (first-time or routine authorize).
 */
export function getAuthorizationUrl(config: GCalendarConfig, userId: string): string {
    const client = createOAuth2Client(config);
    const state = generateOAuthState(userId);
    return client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        state,
    });
}

/**
 * After `invalid_grant`, clear disk tokens and return a URL that prompts consent so Google issues a new refresh token.
 */
export async function invalidateTokensAndGetAuthUrl(
    config: GCalendarConfig,
    userId: string
): Promise<string> {
    await clearStoredTokens(userId);
    const client = createOAuth2Client(config);
    const state = generateOAuthState(userId);
    return client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent',
        state,
    });
}

export interface GCalendarConfig {
    client_id: string;
    client_secret: string;
    redirect_uris: string[];
}

export function createOAuth2Client(config: GCalendarConfig): OAuth2Client {
    return new OAuth2Client(config.client_id, config.client_secret, config.redirect_uris[0]);
}

/**
 * Load stored tokens from the specified user's token file and return an authenticated OAuth2 client.
 * Throws if file is missing or invalid.
 */
export async function getAuthenticatedClient(
    config: GCalendarConfig,
    userId: string
): Promise<{
    oauth2Client: OAuth2Client;
    calendar: ReturnType<typeof calendar>;
}> {
    const oauth2Client = createOAuth2Client(config);
    const tokenPath = userTokenPath(userId);
    const tokenData = await fs.readFile(tokenPath, 'utf-8');
    const tokens = JSON.parse(tokenData);
    oauth2Client.setCredentials(tokens);
    const calendarClient = calendar({ version: 'v3', auth: oauth2Client });
    return { oauth2Client, calendar: calendarClient };
}

/**
 * Save tokens to the specified user's token file (e.g. after an OAuth callback).
 */
export async function saveTokens(userId: string, tokens: unknown): Promise<void> {
    const tokenPath = userTokenPath(userId);
    await fs.mkdir(path.dirname(tokenPath), { recursive: true });
    await fs.writeFile(tokenPath, JSON.stringify(tokens, null, 2));
}

function userTokenPath(userId: string): string {
    if (!/^[A-Za-z0-9_-]+$/.test(userId)) {
        throw new Error('Invalid user id for Google Calendar token storage');
    }
    return path.join(process.cwd(), 'config', `google-tokens-${userId}.json`);
}
