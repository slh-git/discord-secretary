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
 * POST JSON with a **wall-clock** timeout from request start.
 *
 * Node's built-in `timeout` on `http.request` is socket *inactivity*: while Ollama
 * (or any LLM) runs inference it sends nothing, so the client sees an "idle"
 * socket and hits the limit long before the model finishes. A single timer
 * matches how people set `LOCAL_LLM_TIMEOUT_MS` (total wait for a reply).
 */
function postJson<TResponse>(
    urlString: string,
    body: unknown,
    timeoutMs: number
): Promise<TResponse> {
    return new Promise((resolve, reject) => {
        const url = new URL(urlString);
        const data = JSON.stringify(body);
        const lib = url.protocol === 'https:' ? https : http;

        let settled = false;
        const finish = (fn: () => void) => {
            if (settled) return;
            settled = true;
            clearTimeout(deadline);
            fn();
        };

        let req: http.ClientRequest;
        const deadline = setTimeout(() => {
            req?.destroy(new Error('Request timed out'));
        }, timeoutMs);

        req = lib.request(
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
            },
            res => {
                let raw = '';
                res.setEncoding('utf8');
                res.on('data', chunk => (raw += chunk));
                res.on('end', () => {
                    if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
                        try {
                            finish(() => resolve(JSON.parse(raw) as TResponse));
                        } catch (err) {
                            finish(() => reject(err));
                        }
                        return;
                    }
                    finish(() =>
                        reject(new Error(`HTTP ${res.statusCode ?? 'unknown'}: ${raw}`))
                    );
                });
                res.on('error', err => finish(() => reject(err)));
            }
        );

        req.on('error', err => finish(() => reject(err)));
        req.write(data);
        req.end();
    });
}

function getJson<TResponse>(urlString: string, timeoutMs: number): Promise<TResponse> {
    return new Promise((resolve, reject) => {
        const url = new URL(urlString);
        const lib = url.protocol === 'https:' ? https : http;

        const req = lib.request(
            {
                protocol: url.protocol,
                hostname: url.hostname,
                port: url.port,
                path: `${url.pathname}${url.search}`,
                method: 'GET',
                headers: { Accept: 'application/json' },
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
        req.end();
    });
}

type OllamaTagsResponse = { models?: Array<{ name?: string; model?: string }> };

/**
 * On startup, check that Ollama's `/api/tags` includes `config.model`.
 * The bot does not auto-pick a model: `LOCAL_LLM_MODEL` must match `ollama list` exactly.
 */
export async function logLocalLlmOllamaProbe(config: LocalLlmConfig): Promise<void> {
    if (!config.enabled) return;

    const tagsUrl = new URL('/api/tags', config.baseUrl).toString();
    const shortTimeout = Math.min(10_000, config.timeoutMs);

    let data: OllamaTagsResponse;
    try {
        data = await getJson<OllamaTagsResponse>(tagsUrl, shortTimeout);
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        Logger.warn(
            'Local LLM is enabled but Ollama was not reached at /api/tags. Is Ollama running and is LOCAL_LLM_BASE_URL correct?',
            { baseUrl: config.baseUrl, error: message }
        );
        return;
    }

    const names = (data.models ?? [])
        .map(m => m.name ?? m.model)
        .filter((n): n is string => Boolean(n));
    const wanted = config.model.trim();
    const found = names.some(n => n === wanted);

    if (found) {
        Logger.info('Local LLM: Ollama has the configured model.', {
            model: wanted,
            baseUrl: config.baseUrl,
        });
        return;
    }

    const sample = names.slice(0, 15).join(', ') || '(none reported)';
    Logger.warn(
        'Local LLM: no model tag matches LOCAL_LLM_MODEL. The bot will still call /api/chat, but Ollama will error until the name matches `ollama list` exactly (e.g. gemma45:e2b).',
        {
            configured: wanted,
            ollamaReports: sample,
            totalListed: names.length,
        }
    );
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
        const isTimeout = /timed out|timeout/i.test(message);
        Logger.warn('Local LLM request failed; falling back to chrono if applicable.', {
            endpoint,
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

    const content = res.message?.content ?? res.output ?? res.response;
    if (content == null || content === '') return [];

    const contentStr = typeof content === 'string' ? content : JSON.stringify(content);

    const parsed = parseEventsPayloadFromContent(contentStr);
    if (parsed == null || typeof parsed !== 'object') {
        Logger.warn('Local LLM returned content that is not valid JSON with an events array.', {
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

