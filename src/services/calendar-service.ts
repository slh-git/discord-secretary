import Config from '../config.js';
import {
    CalendarReauthRequiredError,
    getAuthenticatedClient,
    invalidateTokensAndGetAuthUrl,
    isGoogleInvalidGrant,
} from './gcalendar-auth.js';

export interface CalendarEventInput {
    summary: string;
    start: Date;
    end?: Date;
    allDay?: boolean;
}

/**
 * Insert an event into Google Calendar.
 * Uses shared GCalendar OAuth tokens (config/google-tokens.json).
 * @param calendarId - e.g. 'primary'
 * @param event - summary, start, optional end
 * @returns Created event id and htmlLink, or throws
 */
export async function insertEvent(
    calendarId: string,
    event: CalendarEventInput
): Promise<{ id: string; htmlLink: string }> {
    const { calendar } = await getAuthenticatedClient(Config.gCalendar);

    const start = event.start.toISOString();
    const end = event.end
        ? event.end.toISOString()
        : new Date(event.start.getTime() + (event.allDay ? 24 : 1) * 60 * 60 * 1000).toISOString();

    const requestBody: any = {
        summary: event.summary,
    };

    if (event.allDay) {
        const formatDate = (d: Date): string => {
            const year = d.getFullYear();
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };
        const endDateObj = event.end
            ? event.end
            : new Date(event.start.getTime() + 24 * 60 * 60 * 1000);

        requestBody.start = { date: formatDate(event.start) };
        requestBody.end = { date: formatDate(endDateObj) };
    } else {
        requestBody.start = { dateTime: start, timeZone: 'UTC' };
        requestBody.end = { dateTime: end, timeZone: 'UTC' };
    }

    try {
        const res = await calendar.events.insert({
            calendarId,
            requestBody,
        });

        const id = res.data.id ?? '';
        const htmlLink = res.data.htmlLink ?? '';
        return { id, htmlLink };
    } catch (err: unknown) {
        if (Config.gCalendar && isGoogleInvalidGrant(err)) {
            const authUrl = await invalidateTokensAndGetAuthUrl(Config.gCalendar);
            throw new CalendarReauthRequiredError(authUrl);
        }
        throw err;
    }
}
