import { google } from 'googleapis';
import fs from 'node:fs/promises';
import path from 'node:path';

/** Scopes: read calendar and create/edit events. */
export const SCOPES = [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events',
];

export const TOKEN_PATH = path.join(process.cwd(), 'config', 'google-tokens.json');

/** Thrown when stored tokens were cleared; user must open `authUrl` and sign in again. */
export class CalendarReauthRequiredError extends Error {
    constructor(public readonly authUrl: string) {
        super('Google Calendar re-authorization required');
        this.name = 'CalendarReauthRequiredError';
    }
}

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
 * Remove saved OAuth tokens so the next successful OAuth callback writes fresh tokens.
 */
export async function clearStoredTokens(): Promise<void> {
    try {
        await fs.unlink(TOKEN_PATH);
    } catch (err: unknown) {
        const code = (err as NodeJS.ErrnoException)?.code;
        if (code !== 'ENOENT') throw err;
    }
}

/**
 * Build the Google OAuth URL (first-time or routine authorize).
 */
export function getAuthorizationUrl(config: GCalendarConfig): string {
    const client = createOAuth2Client(config);
    return client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
    });
}

/**
 * After `invalid_grant`, clear disk tokens and return a URL that prompts consent so Google issues a new refresh token.
 */
export async function invalidateTokensAndGetAuthUrl(config: GCalendarConfig): Promise<string> {
    await clearStoredTokens();
    const client = createOAuth2Client(config);
    return client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent',
    });
}

export interface GCalendarConfig {
    client_id: string;
    client_secret: string;
    redirect_uris: string[];
}

export function createOAuth2Client(
    config: GCalendarConfig
): import('googleapis').Auth.OAuth2Client {
    return new google.auth.OAuth2(config.client_id, config.client_secret, config.redirect_uris[0]);
}

/**
 * Load stored tokens from TOKEN_PATH and return an authenticated OAuth2 client.
 * Throws if file is missing or invalid.
 */
export async function getAuthenticatedClient(config: GCalendarConfig): Promise<{
    oauth2Client: import('googleapis').Auth.OAuth2Client;
    calendar: ReturnType<typeof google.calendar>;
}> {
    const oauth2Client = createOAuth2Client(config);
    const tokenData = await fs.readFile(TOKEN_PATH, 'utf-8');
    const tokens = JSON.parse(tokenData);
    oauth2Client.setCredentials(tokens);
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    return { oauth2Client, calendar };
}

/**
 * Save tokens to TOKEN_PATH (e.g. after OAuth callback).
 */
export async function saveTokens(tokens: unknown): Promise<void> {
    await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2));
}
