import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

import { Logger } from './logger.js';

export interface LocalLlmConfig {
    enabled: boolean;
    baseUrl: string;
    model: string;
    timeoutMs: number;
}

export interface ParsedEvent {
    summary: string;
    start: string; // ISO-8601
    end?: string; // ISO-8601
    allDay?: boolean;
}

function postJson<TResponse>(
    urlString: string,
    body: unknown,
    timeoutMs: number
): Promise<TResponse> {
    return new Promise((resolve, reject) => {
        const url = new URL(urlString);
        const data = JSON.stringify(body);
        const lib = url.protocol === 'https:' ? https : http;

        const req = lib.request(
            {
                protocol: url.protocol,
                hostname: url.hostname,
                port: url.port,
                path: `${url.pathname}${url.search}`,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data),
                },
                timeout: timeoutMs,
            },
            res => {
                let raw = '';
                res.setEncoding('utf8');
                res.on('data', chunk => (raw += chunk));
                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            resolve(JSON.parse(raw) as TResponse);
                        } catch (err) {
                            reject(err);
                        }
                        return;
                    }
                    reject(new Error(`HTTP ${res.statusCode ?? 'unknown'}: ${raw}`));
                });
            }
        );

        req.on('error', reject);
        req.on('timeout', () => {
            req.destroy(new Error('Request timed out'));
        });
        req.write(data);
        req.end();
    });
}

/**
 * Parse "add event..." free-text into one or more calendar events using a local LLM.
 *
 * This is tuned for Ollama's `/api/chat` endpoint:
 * - baseUrl default: http://127.0.0.1:11434
 * - request: { model, stream:false, format:"json", messages:[...] }
 * - response: { message: { content: "<json string>" } }
 *
 * If your local server differs, adapt `endpoint` and response parsing.
 */
export async function parseEventsWithLocalLlm(
    config: LocalLlmConfig,
    input: {
        text: string;
        nowIso: string;
        timeZone: string;
    }
): Promise<ParsedEvent[]> {
    if (!config.enabled) return [];

    const endpoint = new URL('/api/chat', config.baseUrl).toString();
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

    type ChatResponse = {
        message?: { content?: string };
        output?: string;
        response?: string;
    };

    let res: ChatResponse;
    try {
        res = await postJson<ChatResponse>(
            endpoint,
            {
                model: config.model,
                stream: false,
                format: 'json',
                messages: [
                    { role: 'system', content: system },
                    { role: 'user', content: user },
                ],
            },
            config.timeoutMs
        );
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        Logger.warn('Local LLM request failed; falling back to chrono if applicable.', {
            endpoint,
            model: config.model,
            error: message,
        });
        return [];
    }

    const content = res.message?.content ?? res.output ?? res.response;
    if (!content) return [];

    let parsed: unknown;
    try {
        parsed = JSON.parse(content);
    } catch {
        return [];
    }

    const events = (parsed as any)?.events;
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

