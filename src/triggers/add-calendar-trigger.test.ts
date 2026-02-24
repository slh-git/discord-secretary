import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('chrono-node', () => ({ parse: () => [] }));
vi.mock('../config.js', () => ({ default: { gCalendar: {} } }));

import { AddCalendarTrigger } from './add-calendar-trigger.js';

describe('AddCalendarTrigger', () => {
    let trigger: AddCalendarTrigger;

    beforeEach(() => {
        trigger = new AddCalendarTrigger();
    });

    describe('triggered', () => {
        function mockMessage(content: string | null, bot = false) {
            return { content, author: { bot } } as any;
        }

        it('returns true for "add calendar dentist Wednesday 3 pm"', () => {
            expect(trigger.triggered(mockMessage('add calendar dentist Wednesday 3 pm'))).toBe(true);
        });

        it('returns true for "add event meeting tomorrow at 9 am"', () => {
            expect(trigger.triggered(mockMessage('add event meeting tomorrow at 9 am'))).toBe(true);
        });

        it('returns true for "Add Calendar something"', () => {
            expect(trigger.triggered(mockMessage('Add Calendar something'))).toBe(true);
        });

        it('returns false for "hello"', () => {
            expect(trigger.triggered(mockMessage('hello'))).toBe(false);
        });

        it('returns false when message has no content', () => {
            expect(trigger.triggered(mockMessage(null))).toBe(false);
        });

        it('returns false when author is a bot', () => {
            expect(
                trigger.triggered(mockMessage('add calendar meeting tomorrow', true))
            ).toBe(false);
        });
    });
});
