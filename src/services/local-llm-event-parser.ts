import {
    chat,
    type LlmConfig,
    type LocalLlmConfig,
    logLlmProbe,
    logLocalLlmOllamaProbe,
} from './llm-chat-client.js';
import { Logger } from './logger.js';

export type { LlmConfig, LocalLlmConfig };
export { logLlmProbe, logLocalLlmOllamaProbe };

export interface ParsedEvent {
    summary: string;
    start: string; // ISO-8601
    end?: string; // ISO-8601
    allDay?: boolean;
}

/**
 * Models often wrap JSON in markdown fences or leading/trailing prose;
 * try direct parse, then fenced block, then first `{...}` span.
 */
function parseEventsPayloadFromContent(content: string): unknown | undefined {
    const trimmed = content.trim();
    const attempts: Array<() => unknown> = [
        () => JSON.parse(trimmed),
        () => {
            const m = trimmed.match(/^```(?:json)?\s*\n?([\s\S]*?)```/im);
            if (!m) throw new SyntaxError('no fence');
            return JSON.parse(m[1].trim());
        },
        () => {
            const start = trimmed.indexOf('{');
            const end = trimmed.lastIndexOf('}');
            if (start < 0 || end <= start) throw new SyntaxError('no object');
            return JSON.parse(trimmed.slice(start, end + 1));
        },
    ];

    for (const run of attempts) {
        try {
            return run();
        } catch {
            /* try next */
        }
    }
    return undefined;
}

/**
 * Parse "add event..." free-text into one or more calendar events using an LLM
 * (Ollama or OpenRouter).
 */
export async function parseEventsWithLocalLlm(
    config: LlmConfig,
    input: {
        text: string;
        nowIso: string;
        timeZone: string;
    }
): Promise<ParsedEvent[]> {
    if (!config.enabled) return [];

    const schema = {
        type: 'object',
        additionalProperties: false,
        properties: {
            events: {
                type: 'array',
                minItems: 1,
                items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['summary', 'start'],
                    properties: {
                        summary: { type: 'string', minLength: 1 },
                        start: { type: 'string', minLength: 1 },
                        end: { type: 'string' },
                        allDay: { type: 'boolean' },
                    },
                },
            },
        },
        required: ['events'],
    } as const;

    const system = [
        'You extract Google Calendar events from a user message.',
        'Return ONLY valid JSON matching the provided schema.',
        'Interpret relative dates using nowIso and timeZone.',
        'For timed events, always include timezone offset in start/end (e.g. -04:00 or Z).',
        'If the user lists multiple events joined by "and", split them into separate events.',
        'If time is omitted, set allDay=true and use an all-day date (YYYY-MM-DD) as start.',
        'If duration is omitted for timed events, omit end.',
        'Do not include any explanatory text.',
    ].join('\n');

    const user = JSON.stringify(
        {
            schema,
            nowIso: input.nowIso,
            timeZone: input.timeZone,
            text: input.text,
            examples: [
                {
                    text: 'add event for dentist on Wednesday 3pm',
                    output: { events: [{ summary: 'dentist', start: '2026-04-15T15:00:00-04:00' }] },
                },
                {
                    text: 'add event for standup on Monday and retro on Friday at 2pm',
                    output: {
                        events: [
                            { summary: 'standup', start: '2026-04-13', allDay: true },
                            { summary: 'retro', start: '2026-04-17T14:00:00-04:00' },
                        ],
                    },
                },
            ],
        },
        null,
        2
    );

    let contentStr: string;
    try {
        const res = await chat(
            config,
            [
                { role: 'system', content: system },
                { role: 'user', content: user },
            ],
            { responseFormat: 'json' }
        );
        contentStr = res.content;
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        const isTimeout = /timed out|timeout/i.test(message);
        Logger.warn('LLM request failed; falling back to chrono if applicable.', {
            provider: config.provider,
            model: config.model,
            error: message,
            timeoutMs: config.timeoutMs,
            ...(isTimeout
                ? {
                      hint: 'If the model is slow or on a remote host, raise LOCAL_LLM_TIMEOUT_MS (e.g. 600000 for 10 minutes).',
                  }
                : {}),
        });
        return [];
    }

    if (contentStr === '') return [];

    const parsed = parseEventsPayloadFromContent(contentStr);
    if (parsed == null || typeof parsed !== 'object') {
        Logger.warn('LLM returned content that is not valid JSON with an events array.', {
            provider: config.provider,
            model: config.model,
            preview: contentStr.slice(0, 200),
        });
        return [];
    }

    const events = (parsed as { events?: unknown }).events;
    if (!Array.isArray(events)) return [];

    return events
        .filter(e => e && typeof e.summary === 'string' && typeof e.start === 'string')
        .map(e => ({
            summary: String(e.summary).trim(),
            start: String(e.start).trim(),
            end: e.end != null ? String(e.end).trim() : undefined,
            allDay: e.allDay === true ? true : undefined,
        }))
        .filter(e => e.summary.length > 0 && e.start.length > 0);
}
