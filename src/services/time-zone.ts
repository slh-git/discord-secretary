import { formatInTimeZone as formatZoned, fromZonedTime } from 'date-fns-tz';

const ISO_DATE_TIME =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|[+-]\d{2}:\d{2})?$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseDateOnly(value: string): Date {
    const match = ISO_DATE.exec(value);
    if (!match) return new Date(NaN);
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    date.setUTCHours(0, 0, 0, 0);
    return date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
        ? date
        : new Date(NaN);
}

export function parseIsoInTimeZone(value: string, timeZone: string): Date {
    const match = ISO_DATE_TIME.exec(value);
    if (!match) return new Date(NaN);

    const [, year, month, day, hour, minute, second = '00', fraction = '0', offset] = match;
    const milliseconds = Number(fraction.padEnd(3, '0'));
    const [y, m, d, h, min, s] = [year, month, day, hour, minute, second].map(Number);
    if (
        m < 1 ||
        m > 12 ||
        d < 1 ||
        d > 31 ||
        h > 23 ||
        min > 59 ||
        s > 59 ||
        (offset &&
            offset !== 'Z' &&
            (Number(offset.slice(1, 3)) > 23 || Number(offset.slice(4)) > 59))
    ) {
        return new Date(NaN);
    }

    const wallTime = new Date(0);
    wallTime.setUTCFullYear(y, m - 1, d);
    wallTime.setUTCHours(h, min, s, milliseconds);
    if (
        wallTime.getUTCFullYear() !== y ||
        wallTime.getUTCMonth() !== m - 1 ||
        wallTime.getUTCDate() !== d
    ) {
        return new Date(NaN);
    }

    if (offset) {
        const instant = new Date(value);
        if (Number.isNaN(instant.getTime())) return instant;
        const offsetMinutes =
            offset === 'Z'
                ? 0
                : (offset[0] === '+' ? 1 : -1) *
                  (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(4)));
        const representedWallTime = new Date(instant.getTime() + offsetMinutes * 60_000);
        return representedWallTime.getTime() === wallTime.getTime() ? instant : new Date(NaN);
    }

    try {
        const instant = fromZonedTime(value, timeZone);
        if (Number.isNaN(instant.getTime())) return instant;
        const roundTrip = formatZoned(instant, timeZone, `yyyy-MM-dd'T'HH:mm:ss.SSS`);
        const expected = `${year}-${month}-${day}T${hour}:${minute}:${second}.${String(milliseconds).padStart(3, '0')}`;
        return roundTrip === expected ? instant : new Date(NaN);
    } catch {
        return new Date(NaN);
    }
}

export function formatInTimeZone(
    date: Date,
    timeZone: string,
    includeTime: boolean = true
): string {
    return formatZoned(date, timeZone, includeTime ? 'MMM d, yyyy h:mm a zzz' : 'MMM d, yyyy');
}
