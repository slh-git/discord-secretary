import assert from 'node:assert/strict';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import test from 'node:test';
import { fileURLToPath, URL } from 'node:url';

import { formatInTimeZone, parseDateOnly, parseIsoInTimeZone } from '../dist/services/time-zone.js';

const configPath = fileURLToPath(new URL('../config/config.json', import.meta.url));
const createdConfig = !existsSync(configPath);
if (createdConfig) {
    mkdirSync(fileURLToPath(new URL('../config/', import.meta.url)), {
        recursive: true,
    });
    writeFileSync(
        configPath,
        JSON.stringify({ client: {}, api: {}, developers: [], localLlm: {} })
    );
}
let AddCalendarTrigger;
try {
    ({ AddCalendarTrigger } = await import('../dist/triggers/add-calendar-trigger.js'));
} finally {
    if (createdConfig) unlinkSync(configPath);
}

test('ISO times preserve explicit offsets and interpret local times in the given zone', () => {
    assert.equal(
        parseIsoInTimeZone('2026-10-21T15:00:00-04:00', 'America/Toronto').toISOString(),
        '2026-10-21T19:00:00.000Z'
    );
    assert.equal(
        parseIsoInTimeZone('2026-10-21T15:00:00', 'America/Toronto').toISOString(),
        '2026-10-21T19:00:00.000Z'
    );
    assert.match(
        formatInTimeZone(new Date('2026-10-21T19:00:00.000Z'), 'America/Toronto'),
        /3:00 PM/
    );
});

test('invalid dates and nonexistent local times are rejected', () => {
    for (const value of [
        '2026-02-30T15:00:00-05:00',
        '2026-13-01T15:00:00',
        '2026-03-08T02:30:00',
    ]) {
        assert.ok(Number.isNaN(parseIsoInTimeZone(value, 'America/Toronto').getTime()), value);
    }
    assert.ok(Number.isNaN(parseDateOnly('2026-02-30').getTime()));
});

test('confirmation uses the saved timezone and executes once for the right caller', async () => {
    const queued = [];
    const sent = [];
    const trigger = new AddCalendarTrigger({
        enqueueReminder: async input => {
            queued.push(input);
            return { id: 'job-1' };
        },
    });
    const token = trigger.pendingActions.save(
        'owner',
        'channel',
        [{ kind: 'schedule_reminder', when: '2026-10-21T15:00:00', text: 'Call Alex' }],
        'America/Toronto',
        new Date(Date.now() + 60_000)
    );
    assert.match(token, /^[a-z0-9-]{6,}$/);

    // eslint-disable-next-line @typescript-eslint/explicit-function-return-type
    const confirm = async (userId, channelId) => {
        return await trigger.execute({
            content: `confirm ${token}`,
            author: { id: userId, bot: false },
            channelId,
            channel: {
                send: async payload => {
                    sent.push(payload);
                },
            },
        });
    };

    await confirm('other', 'channel');
    await confirm('owner', 'other-channel');
    assert.equal(queued.length, 0);

    await confirm('owner', 'channel');
    assert.equal(queued.length, 1);
    assert.equal(queued[0].dueAtIso, '2026-10-21T19:00:00.000Z');

    await confirm('owner', 'channel');
    assert.equal(queued.length, 1);
    assert.equal(sent.length, 4);
});

test('expired confirmation never queues a reminder', async () => {
    let queued = 0;
    const trigger = new AddCalendarTrigger({
        enqueueReminder: async () => {
            queued++;
            return { id: 'unexpected' };
        },
    });
    const token = trigger.pendingActions.save(
        'owner',
        'channel',
        [{ kind: 'schedule_reminder', when: '2026-10-21T15:00:00', text: 'Call Alex' }],
        'America/Toronto',
        new Date(Date.now() - 1)
    );
    await trigger.execute({
        content: `confirm ${token}`,
        author: { id: 'owner', bot: false },
        channelId: 'channel',
        channel: { send: async () => {} },
    });
    assert.equal(queued, 0);
});
