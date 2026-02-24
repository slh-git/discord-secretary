import { google } from 'googleapis';
import fs from 'node:fs/promises';
import path from 'node:path';

/** Scopes: read calendar and create/edit events. */
export const SCOPES = [
    'https://www.googleapis.com/auth/calendar.readonly',
    'https://www.googleapis.com/auth/calendar.events',
];

export const TOKEN_PATH = path.join(process.cwd(), 'config', 'google-tokens.json');

export interface GCalendarConfig {
    client_id: string;
    client_secret: string;
    redirect_uris: string[];
}

export function createOAuth2Client(config: GCalendarConfig): import('googleapis').auth.OAuth2 {
    return new google.auth.OAuth2(
        config.client_id,
        config.client_secret,
        config.redirect_uris[0]
    );
}

/**
 * Load stored tokens from TOKEN_PATH and return an authenticated OAuth2 client.
 * Throws if file is missing or invalid.
 */
export async function getAuthenticatedClient(
    config: GCalendarConfig
): Promise<{ oauth2Client: import('googleapis').auth.OAuth2; calendar: ReturnType<typeof google.calendar> }> {
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
