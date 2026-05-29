import http from 'node:http';
import https from 'node:https';
import { URL } from 'node:url';

import { Logger } from './logger.js';

export type LlmProvider = 'ollama' | 'openrouter';

export interface LlmConfig {
    enabled: boolean;
    provider: LlmProvider;
    baseUrl: string;
    model: string;
    timeoutMs: number;
    toolMaxRounds: number;
    apiKey?: string;
}

/** @deprecated Use LlmConfig */
export type LocalLlmConfig = LlmConfig;

export interface LlmToolCall {
    id: string;
    name: string;
    arguments: unknown;
}

export interface LlmMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    toolCalls?: LlmToolCall[];
    toolCallId?: string;
    toolName?: string;
}

export interface LlmChatResult {
    content: string;
    toolCalls: LlmToolCall[];
}

export interface LlmChatOptions {
    tools?: unknown[];
    responseFormat?: 'json';
}

/**
 * POST JSON with a **wall-clock** timeout from request start.
 */
export function postJson<TResponse>(
    urlString: string,
    body: unknown,
    timeoutMs: number,
    extraHeaders?: Record<string, string>
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

        const headers: Record<string, string | number> = {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data),
            ...extraHeaders,
        };

        req = lib.request(
            {
                protocol: url.protocol,
                hostname: url.hostname,
                port: url.port,
                path: `${url.pathname}${url.search}`,
                method: 'POST',
                headers,
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

function getJson<TResponse>(
    urlString: string,
    timeoutMs: number,
    extraHeaders?: Record<string, string>
): Promise<TResponse> {
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
                headers: { Accept: 'application/json', ...extraHeaders },
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

function openRouterHeaders(config: LlmConfig): Record<string, string> {
    const headers: Record<string, string> = {};
    if (config.apiKey) {
        headers.Authorization = `Bearer ${config.apiKey}`;
    }
    const referer = process.env.OPENROUTER_HTTP_REFERER?.trim();
    const title = process.env.OPENROUTER_X_TITLE?.trim() ?? 'discord-secretary';
    if (referer) headers['HTTP-Referer'] = referer;
    if (title) headers['X-Title'] = title;
    return headers;
}

function ensureApiKey(config: LlmConfig): void {
    if (config.provider === 'openrouter' && !config.apiKey?.trim()) {
        throw new Error(
            'OPENROUTER_API_KEY is required when LOCAL_LLM_PROVIDER=openrouter and LOCAL_LLM_ENABLED=true'
        );
    }
}

let toolCallCounter = 0;

function nextToolCallId(): string {
    toolCallCounter += 1;
    return `call_${Date.now()}_${toolCallCounter}`;
}

function normalizeToolCalls(raw: unknown): LlmToolCall[] {
    if (!Array.isArray(raw)) return [];

    const out: LlmToolCall[] = [];
    for (const item of raw) {
        if (!item || typeof item !== 'object') continue;
        const row = item as Record<string, unknown>;
        const fn = row.function as Record<string, unknown> | undefined;
        const name =
            (typeof fn?.name === 'string' ? fn.name : undefined) ??
            (typeof row.name === 'string' ? row.name : undefined);
        if (!name) continue;

        const id =
            (typeof row.id === 'string' && row.id.length > 0 ? row.id : undefined) ?? nextToolCallId();
        const args = fn?.arguments ?? row.arguments;
        out.push({ id, name, arguments: args });
    }
    return out;
}

function toWireMessages(config: LlmConfig, messages: LlmMessage[]): unknown[] {
    if (config.provider === 'openrouter') {
        return messages.map(msg => {
            if (msg.role === 'tool') {
                return {
                    role: 'tool',
                    tool_call_id: msg.toolCallId ?? nextToolCallId(),
                    content: msg.content,
                };
            }
            if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
                return {
                    role: 'assistant',
                    content: msg.content || null,
                    tool_calls: msg.toolCalls.map(call => ({
                        id: call.id,
                        type: 'function',
                        function: {
                            name: call.name,
                            arguments:
                                typeof call.arguments === 'string'
                                    ? call.arguments
                                    : JSON.stringify(call.arguments ?? {}),
                        },
                    })),
                };
            }
            return { role: msg.role, content: msg.content };
        });
    }

    return messages.map(msg => {
        if (msg.role === 'tool') {
            return {
                role: 'tool',
                tool_name: msg.toolName ?? 'unknown',
                content: msg.content,
            };
        }
        if (msg.role === 'assistant' && msg.toolCalls && msg.toolCalls.length > 0) {
            return {
                role: 'assistant',
                content: msg.content,
                tool_calls: msg.toolCalls.map(call => ({
                    function: {
                        name: call.name,
                        arguments: call.arguments,
                    },
                })),
            };
        }
        return { role: msg.role, content: msg.content };
    });
}

async function chatOllama(
    config: LlmConfig,
    messages: LlmMessage[],
    options?: LlmChatOptions
): Promise<LlmChatResult> {
    const endpoint = new URL('/api/chat', config.baseUrl).toString();
    const body: Record<string, unknown> = {
        model: config.model,
        stream: false,
        messages: toWireMessages(config, messages),
    };
    if (options?.tools?.length) body.tools = options.tools;
    if (options?.responseFormat === 'json') body.format = 'json';

    type ChatResponse = {
        message?: { content?: string; tool_calls?: unknown };
        output?: string;
        response?: string;
    };

    const res = await postJson<ChatResponse>(endpoint, body, config.timeoutMs);
    const content = res.message?.content ?? res.output ?? res.response ?? '';
    const contentStr = typeof content === 'string' ? content : JSON.stringify(content);
    return {
        content: contentStr,
        toolCalls: normalizeToolCalls(res.message?.tool_calls),
    };
}

async function chatOpenRouter(
    config: LlmConfig,
    messages: LlmMessage[],
    options?: LlmChatOptions
): Promise<LlmChatResult> {
    ensureApiKey(config);
    const endpoint = new URL('chat/completions', config.baseUrl).toString();
    const body: Record<string, unknown> = {
        model: config.model,
        stream: false,
        messages: toWireMessages(config, messages),
    };
    if (options?.tools?.length) {
        body.tools = options.tools;
        body.tool_choice = 'auto';
    }
    if (options?.responseFormat === 'json') {
        body.response_format = { type: 'json_object' };
    }

    type ChatResponse = {
        choices?: Array<{
            message?: { content?: string | null; tool_calls?: unknown };
        }>;
    };

    const res = await postJson<ChatResponse>(
        endpoint,
        body,
        config.timeoutMs,
        openRouterHeaders(config)
    );
    const message = res.choices?.[0]?.message;
    const content = message?.content ?? '';
    return {
        content: typeof content === 'string' ? content : '',
        toolCalls: normalizeToolCalls(message?.tool_calls),
    };
}

export async function chat(
    config: LlmConfig,
    messages: LlmMessage[],
    options?: LlmChatOptions
): Promise<LlmChatResult> {
    if (config.provider === 'openrouter') {
        return chatOpenRouter(config, messages, options);
    }
    return chatOllama(config, messages, options);
}

type OllamaTagsResponse = { models?: Array<{ name?: string; model?: string }> };

/**
 * On startup, probe the configured LLM provider (Ollama model list or OpenRouter config).
 */
export async function logLlmProbe(config: LlmConfig): Promise<void> {
    if (!config.enabled) return;

    if (config.provider === 'openrouter') {
        if (!config.apiKey?.trim()) {
            Logger.warn(
                'LLM is enabled with provider openrouter but OPENROUTER_API_KEY is missing. LLM requests will fail until the key is set.',
                { baseUrl: config.baseUrl, model: config.model }
            );
            return;
        }
        Logger.info('LLM: OpenRouter configured.', {
            provider: config.provider,
            model: config.model,
            baseUrl: config.baseUrl,
        });
        return;
    }

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

/** @deprecated Use logLlmProbe */
export const logLocalLlmOllamaProbe = logLlmProbe;

export function createToolResultMessage(
    config: LlmConfig,
    call: Pick<LlmToolCall, 'id' | 'name'>,
    content: string
): LlmMessage {
    return {
        role: 'tool',
        content,
        toolCallId: call.id,
        toolName: call.name,
    };
}
