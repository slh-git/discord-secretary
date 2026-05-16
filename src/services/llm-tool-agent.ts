import { URL } from 'node:url';

import { insertEvent } from './calendar-service.js';
import { JobStore } from './job-store.js';
import { LocalLlmConfig, postJson } from './local-llm-event-parser.js';
import { Logger } from './logger.js';

export interface ButlerAgentInput {
    text: string;
    userId: string;
    channelId: string;
    nowIso: string;
    timeZone: string;
}

export type ButlerAction =
    | {
          kind: 'create_calendar_event';
          summary: string;
          start: string;
          end?: string;
          allDay?: boolean;
      }
    | {
          kind: 'schedule_reminder';
          when: string;
          text: string;
      };

export interface ButlerAgentExecution {
    kind: ButlerAction['kind'];
    ok: boolean;
    summary: string;
    when: string;
    link?: string;
    jobId?: string;
    error?: string;
}

export interface ButlerAgentResult {
    assistantText: string;
    executed: ButlerAgentExecution[];
    pendingConfirmation: ButlerAction[];
    confirmationReason?: string;
}

interface ToolDefinition {
    type: 'function';
    function: {
        name: string;
        description: string;
        parameters: {
            type: 'object';
            properties: Record<string, unknown>;
            required?: string[];
            additionalProperties?: boolean;
        };
    };
}

interface ToolCall {
    function?: {
        name?: string;
        arguments?: unknown;
    };
}

interface ChatMessage {
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    tool_calls?: ToolCall[];
    tool_name?: string;
}

interface ChatResponse {
    message?: {
        content?: string;
        tool_calls?: ToolCall[];
    };
}

const DEFAULT_MAX_ROUNDS = 5;

export async function runButlerToolLoop(
    config: LocalLlmConfig,
    jobStore: JobStore,
    input: ButlerAgentInput,
    options?: { forceExecuteRisky?: boolean; maxRounds?: number }
): Promise<ButlerAgentResult> {
    if (!config.enabled) {
        return {
            assistantText: '',
            executed: [],
            pendingConfirmation: [],
        };
    }

    const endpoint = new URL('/api/chat', config.baseUrl).toString();
    const maxRounds = Math.max(1, options?.maxRounds ?? DEFAULT_MAX_ROUNDS);
    const tools = buildTools();
    const messages: ChatMessage[] = [
        { role: 'system', content: buildSystemPrompt() },
        {
            role: 'user',
            content: JSON.stringify(
                {
                    text: input.text,
                    nowIso: input.nowIso,
                    timeZone: input.timeZone,
                },
                null,
                2
            ),
        },
    ];

    const executed: ButlerAgentExecution[] = [];
    let assistantText = '';

    for (let round = 0; round < maxRounds; round++) {
        const response = await postJson<ChatResponse>(
            endpoint,
            {
                model: config.model,
                stream: false,
                messages,
                tools,
            },
            config.timeoutMs
        );

        const content = response.message?.content ?? '';
        const toolCalls = response.message?.tool_calls ?? [];
        assistantText = content || assistantText;

        messages.push({
            role: 'assistant',
            content,
            tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
        });

        if (toolCalls.length === 0) {
            return {
                assistantText,
                executed,
                pendingConfirmation: [],
            };
        }

        const actions: ButlerAction[] = [];
        for (const call of toolCalls) {
            const parsed = parseToolCall(call);
            if (!parsed) {
                messages.push({
                    role: 'tool',
                    tool_name: call.function?.name ?? 'unknown',
                    content: JSON.stringify({ ok: false, error: 'Invalid tool call arguments' }),
                });
                continue;
            }
            actions.push(parsed);
        }

        if (actions.length === 0) {
            continue;
        }

        const needsConfirmation = !options?.forceExecuteRisky && isRisky(actions);
        if (needsConfirmation) {
            return {
                assistantText,
                executed,
                pendingConfirmation: actions,
                confirmationReason: getConfirmationReason(actions),
            };
        }

        const runResults = await executeButlerActions(actions, jobStore, input);
        executed.push(...runResults);

        for (const result of runResults) {
            messages.push({
                role: 'tool',
                tool_name: result.kind,
                content: JSON.stringify(result),
            });
        }
    }

    Logger.warn('Butler tool loop hit max rounds before completion.', {
        maxRounds,
        model: config.model,
    });
    return {
        assistantText,
        executed,
        pendingConfirmation: [],
    };
}

export async function executeButlerActions(
    actions: ButlerAction[],
    jobStore: JobStore,
    input: Pick<ButlerAgentInput, 'userId' | 'channelId'>
): Promise<ButlerAgentExecution[]> {
    const results: ButlerAgentExecution[] = [];

    for (const action of actions) {
        if (action.kind === 'create_calendar_event') {
            const allDay = action.allDay === true || /^\d{4}-\d{2}-\d{2}$/.test(action.start);
            const start = new Date(allDay ? `${action.start}T00:00:00.000Z` : action.start);
            const end =
                action.end != null
                    ? new Date(allDay ? `${action.end}T00:00:00.000Z` : action.end)
                    : undefined;

            if (Number.isNaN(start.getTime())) {
                results.push({
                    kind: action.kind,
                    ok: false,
                    summary: action.summary,
                    when: action.start,
                    error: 'Invalid start time',
                });
                continue;
            }

            try {
                const { htmlLink } = await insertEvent('primary', {
                    summary: action.summary,
                    start,
                    end,
                    allDay,
                });
                results.push({
                    kind: action.kind,
                    ok: true,
                    summary: action.summary,
                    when: allDay ? start.toLocaleDateString() : start.toLocaleString(),
                    link: htmlLink,
                });
            } catch (err: unknown) {
                results.push({
                    kind: action.kind,
                    ok: false,
                    summary: action.summary,
                    when: action.start,
                    error: unknownToErrorMessage(err),
                });
            }
            continue;
        }

        const dueAt = new Date(action.when);
        if (Number.isNaN(dueAt.getTime())) {
            results.push({
                kind: action.kind,
                ok: false,
                summary: action.text,
                when: action.when,
                error: 'Invalid reminder time',
            });
            continue;
        }

        try {
            const job = await jobStore.enqueueReminder({
                userId: input.userId,
                channelId: input.channelId,
                dueAtIso: dueAt.toISOString(),
                text: action.text,
            });
            results.push({
                kind: action.kind,
                ok: true,
                summary: action.text,
                when: dueAt.toLocaleString(),
                jobId: job.id,
            });
        } catch (err: unknown) {
            results.push({
                kind: action.kind,
                ok: false,
                summary: action.text,
                when: action.when,
                error: unknownToErrorMessage(err),
            });
        }
    }

    return results;
}

function parseToolCall(call: ToolCall): ButlerAction | undefined {
    const name = call.function?.name;
    const args = parseToolArguments(call.function?.arguments);
    if (!name || !args) return undefined;

    if (name === 'create_calendar_event') {
        const summary = toTrimmedString(args.summary);
        const start = toTrimmedString(args.start);
        if (!summary || !start) return undefined;
        const end = toTrimmedString(args.end);
        return {
            kind: 'create_calendar_event',
            summary,
            start,
            end: end || undefined,
            allDay: args.allDay === true ? true : undefined,
        };
    }

    if (name === 'schedule_reminder') {
        const when = toTrimmedString(args.when);
        const text = toTrimmedString(args.text);
        if (!when || !text) return undefined;
        return {
            kind: 'schedule_reminder',
            when,
            text,
        };
    }

    return undefined;
}

function parseToolArguments(value: unknown): Record<string, unknown> | undefined {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }
    if (typeof value === 'string') {
        try {
            const parsed = JSON.parse(value);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                return parsed as Record<string, unknown>;
            }
        } catch {
            return undefined;
        }
    }
    return undefined;
}

function toTrimmedString(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const out = value.trim();
    return out.length > 0 ? out : undefined;
}

function unknownToErrorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    try {
        return JSON.stringify(err);
    } catch {
        return 'Unknown error';
    }
}

function isRisky(actions: ButlerAction[]): boolean {
    if (actions.length > 1) return true;
    return actions.some(action => action.kind === 'schedule_reminder');
}

function getConfirmationReason(actions: ButlerAction[]): string {
    if (actions.length > 1) {
        return 'multiple_actions';
    }
    if (actions[0]?.kind === 'schedule_reminder') {
        return 'reminder_requires_confirmation';
    }
    return 'ambiguous';
}

function buildSystemPrompt(): string {
    return [
        'You are a scheduling butler for a Discord user.',
        'Use tools to create calendar events or reminders from natural language.',
        'Call create_calendar_event for calendar entries.',
        'Call schedule_reminder for reminder messages.',
        'Always use ISO-8601 for start/end/when.',
        'If a date is all-day, use YYYY-MM-DD and set allDay=true.',
        'If information is missing, ask a concise follow-up question in plain text.',
        'Do not invent fields outside tool schemas.',
    ].join('\n');
}

function buildTools(): ToolDefinition[] {
    return [
        {
            type: 'function',
            function: {
                name: 'create_calendar_event',
                description: 'Create a Google Calendar event.',
                parameters: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['summary', 'start'],
                    properties: {
                        summary: { type: 'string' },
                        start: { type: 'string', description: 'ISO-8601 datetime or YYYY-MM-DD' },
                        end: { type: 'string', description: 'ISO-8601 datetime or YYYY-MM-DD' },
                        allDay: { type: 'boolean' },
                    },
                },
            },
        },
        {
            type: 'function',
            function: {
                name: 'schedule_reminder',
                description: 'Schedule a reminder message for later.',
                parameters: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['when', 'text'],
                    properties: {
                        when: { type: 'string', description: 'ISO-8601 datetime for reminder' },
                        text: { type: 'string', description: 'Reminder message text' },
                    },
                },
            },
        },
    ];
}
