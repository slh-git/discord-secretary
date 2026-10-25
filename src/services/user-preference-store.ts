import fs from 'node:fs';
import path from 'node:path';

import { Logger } from './logger.js';

interface UserPreferencesFile {
    timeZones: Record<string, string>;
}

const preferencesPath = path.join(process.cwd(), 'data', 'user-preferences.json');
const userPreferences = loadPreferences();

export class UserPreferenceStore {
    public static setTimeZone(userId: string, zone: string): boolean {
        if (!zone || typeof zone !== 'string') {
            Logger.warn('Invalid timezone name provided', { userId, zone });
            return false;
        }

        try {
            new Intl.DateTimeFormat('en-US', { timeZone: zone }).format();
        } catch {
            Logger.warn('Invalid timezone name provided', { userId, zone });
            return false;
        }

        const previous = userPreferences[userId];
        userPreferences[userId] = zone;
        try {
            fs.mkdirSync(path.dirname(preferencesPath), { recursive: true });
            fs.writeFileSync(
                preferencesPath,
                JSON.stringify({ timeZones: userPreferences }, null, 2)
            );
            return true;
        } catch (err: unknown) {
            if (previous === undefined) delete userPreferences[userId];
            else userPreferences[userId] = previous;
            Logger.error('Failed to save user timezone preference.', { userId, error: err });
            return false;
        }
    }

    public static getTimeZone(userId: string): string | undefined {
        return userPreferences[userId];
    }
}

function loadPreferences(): Record<string, string> {
    try {
        const raw = fs.readFileSync(preferencesPath, 'utf8');
        const parsed = JSON.parse(raw) as Partial<UserPreferencesFile>;
        if (!parsed.timeZones || typeof parsed.timeZones !== 'object') return {};
        return Object.fromEntries(
            Object.entries(parsed.timeZones).filter(([, zone]) => typeof zone === 'string')
        );
    } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') {
            Logger.warn('Failed to load user timezone preferences.', { error: err });
        }
        return {};
    }
}
