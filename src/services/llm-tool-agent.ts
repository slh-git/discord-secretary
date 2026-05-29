import { insertEvent } from './calendar-service.js';
import { JobStore } from './job-store.js';
import {
    chat,
    createToolResultMessage,
    type LlmConfig,
    type LlmMessage,
    type LlmToolCall,
} from './llm-chat-client.js';
import { Logger } from './logger.js';
import { formatInTimeZone, parseIsoInTimeZone } from './time-zone.js';

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

export async function runButlerToolLoop(
    config: LlmConfig,
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

    const maxRounds = Math.max(1, options?.maxRounds ?? config.toolMaxRounds);
    const tools = buildTools();
    const messages: LlmMessage[] = [
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
        let response;
        try {
            response = await chat(config, messages, { tools });
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            Logger.warn('Butler tool loop LLM request failed.', {
                provider: config.provider,
                model: config.model,
                error: message,
            });
            throw err;
        }

        const { content, toolCalls } = response;
        assistantText = content || assistantText;

        messages.push({
            role: 'assistant',
            content,
            toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        });

        if (toolCalls.length === 0) {
            return {
                assistantText,
                executed,
                pendingConfirmation: [],
            };
        }

        const parsedCalls: Array<{ call: LlmToolCall; action?: ButlerAction }> = [];
        for (const call of toolCalls) {
            const action = parseToolCall(call);
            if (!action) {
                messages.push(
                    createToolResultMessage(config, call, JSON.stringify({
                        ok: false,
                        error: 'Invalid tool call arguments',
                    }))
                );
                continue;
            }
            parsedCalls.push({ call, action });
        }

        if (parsedCalls.length === 0) {
            continue;
        }

        const actions = parsedCalls.map(p => p.action!);
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

        let resultIdx = 0;
        for (const { call } of parsedCalls) {
            const result = runResults[resultIdx++];
            messages.push(
                createToolResultMessage(config, call, JSON.stringify(result))
            );
        }
    }

    Logger.warn('Butler tool loop hit max rounds before completion.', {
        maxRounds,
        model: config.model,
        provider: config.provider,
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
    input: Pick<ButlerAgentInput, 'userId' | 'channelId' | 'timeZone'>
): Promise<ButlerAgentExecution[]> {
    const results: ButlerAgentExecution[] = [];

    for (const action of actions) {
        if (action.kind === 'create_calendar_event') {
            const allDay = action.allDay === true || /^\d{4}-\d{2}-\d{2}$/.test(action.start);
            const start = allDay
                ? new Date(`${action.start}T00:00:00.000Z`)
                : parseIsoInTimeZone(action.start, input.timeZone);
            const end =
                action.end != null
                    ? allDay
                        ? new Date(`${action.end}T00:00:00.000Z`)
                        : parseIsoInTimeZone(action.end, input.timeZone)
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
                    when: formatInTimeZone(start, input.timeZone, !allDay),
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

        const dueAt = parseIsoInTimeZone(action.when, input.timeZone);
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
                when: formatInTimeZone(dueAt, input.timeZone, true),
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

function parseToolCall(call: LlmToolCall): ButlerAction | undefined {
    const args = parseToolArguments(call.arguments);
    if (!args) return undefined;

    if (call.name === 'create_calendar_event') {
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

    if (call.name === 'schedule_reminder') {
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
        'For timed events and reminders, include timezone offset (e.g. -04:00 or Z).',
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
