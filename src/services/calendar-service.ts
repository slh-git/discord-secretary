import Config from '../config.js';
import { getAuthenticatedClient } from './gcalendar-auth.js';

export interface CalendarEventInput {
    summary: string;
    start: Date;
    end?: Date;
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
        : new Date(event.start.getTime() + 60 * 60 * 1000).toISOString(); // default 1 hour

    const res = await calendar.events.insert({
        calendarId,
        requestBody: {
            summary: event.summary,
            start: { dateTime: start, timeZone: 'UTC' },
            end: { dateTime: end, timeZone: 'UTC' },
        },
    });

    const id = res.data.id ?? '';
    const htmlLink = res.data.htmlLink ?? '';
    return { id, htmlLink };
}
