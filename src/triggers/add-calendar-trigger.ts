import * as chrono from 'chrono-node';
import { EmbedBuilder, Message } from 'discord.js';

import Config from '../config.js';
import { Trigger } from './trigger.js';
import { insertEvent } from '../services/calendar-service.js';
import {
    CalendarReauthRequiredError,
    getAuthenticatedClient,
} from '../services/gcalendar-auth.js';
import { JobStore } from '../services/job-store.js';
import {
    ButlerAction,
    executeButlerActions,
    runButlerToolLoop,
} from '../services/llm-tool-agent.js';
import { parseEventsWithLocalLlm } from '../services/local-llm-event-parser.js';
import { Logger } from '../services/logger.js';

const ADD_CALENDAR_REGEX = /^add\s+(?:calendar|event)\s+(.+)$/i;
const CONFIRM_REGEX = /^confirm\s+([a-z0-9-]{6,})$/i;
const SCHEDULING_HINT_REGEX =
    /\b(schedule|remind|calendar|event|appointment|meeting|tomorrow|today|tonight|next|at\s+\d)/i;
const CONFIRM_TTL_MS = 10 * 60 * 1000;

function unknownToErrorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    try {
        return JSON.stringify(err);
    } catch {
        return 'Unknown error';
    }
}

interface PendingConfirmation {
    userId: string;
    channelId: string;
    createdAtMs: number;
    actions: ButlerAction[];
}

export class AddCalendarTrigger implements Trigger {
    private static pendingConfirmations = new Map<string, PendingConfirmation>();

    constructor(private readonly jobStore: JobStore) {}

    public triggered(msg: Message): boolean {
        if (!msg.content || msg.author.bot) return false;
        if (!Config.developers.includes(msg.author.id)) return false;

        const trimmed = msg.content.trim();
        if (CONFIRM_REGEX.test(trimmed)) return true;
        if (ADD_CALENDAR_REGEX.test(trimmed)) return true;
        if (!Config.localLlm.enabled) return false;

        if (SCHEDULING_HINT_REGEX.test(trimmed)) return true;
        const chronoResults = chrono.parse(trimmed, new Date(), { forwardDate: true });
        return chronoResults.length > 0;
    }

    public async execute(msg: Message): Promise<void> {
        const trimmed = msg.content.trim();
        const confirmMatch = trimmed.match(CONFIRM_REGEX);
        if (confirmMatch) {
            await this.executePendingConfirmation(msg, confirmMatch[1]);
            return;
        }

        const match = trimmed.match(ADD_CALENDAR_REGEX);
        const body = (match?.[1] ?? trimmed).trim();

        if (!body) {
            await this.sendReply(msg, 'Please share what you want to schedule.');
            return;
        }

        const now = new Date();

        if (Config.localLlm.enabled) {
            try {
                const toolResult = await runButlerToolLoop(Config.localLlm, this.jobStore, {
                    text: body,
                    userId: msg.author.id,
                    channelId: msg.channelId,
                    nowIso: now.toISOString(),
                    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
                });

                if (toolResult.pendingConfirmation.length > 0) {
                    const token = this.createConfirmationToken();
                    AddCalendarTrigger.pendingConfirmations.set(token, {
                        userId: msg.author.id,
                        channelId: msg.channelId,
                        createdAtMs: Date.now(),
                        actions: toolResult.pendingConfirmation,
                    });
                    await this.sendReply(
                        msg,
                        this.buildConfirmationEmbed(
                            token,
                            toolResult.pendingConfirmation,
                            toolResult.confirmationReason
                        )
                    );
                    return;
                }

                if (toolResult.executed.length > 0) {
                    await this.sendReply(msg, this.buildExecutionEmbed('Scheduled', toolResult.executed));
                    return;
                }

                if (toolResult.assistantText.trim()) {
                    await this.sendReply(msg, toolResult.assistantText.trim());
                    return;
                }
            } catch (err: unknown) {
                Logger.warn('Butler tool loop failed; falling back to existing parser.', {
                    error: unknownToErrorMessage(err),
                });
            }
        }

        if (!Config.gCalendar) {
            await this.sendReply(msg, 'Calendar integration is not configured.');
            return;
        }

        try {
            await getAuthenticatedClient(Config.gCalendar);
        } catch {
            const embed = new EmbedBuilder()
                .setTitle('Calendar not connected')
                .setDescription(
                    'Please authorize the bot with Google Calendar first. Use the `/gcalendar` command and follow the link to sign in.'
                )
                .setColor('#ff4a4a');
            await this.sendReply(msg, embed);
            return;
        }

        const chronoResults = chrono.parse(body, now, { forwardDate: true });

        try {
            if (Config.localLlm.enabled) {
                const parsed = await parseEventsWithLocalLlm(Config.localLlm, {
                    text: body,
                    nowIso: now.toISOString(),
                    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
                });

                if (parsed.length > 0) {
                    const created: Array<{ summary: string; when: string; link: string }> = [];
                    const failed: Array<{ summary: string; reason: string }> = [];

                    for (const e of parsed) {
                        try {
                            const allDay = e.allDay === true || /^\d{4}-\d{2}-\d{2}$/.test(e.start);
                            const start = new Date(allDay ? `${e.start}T00:00:00.000Z` : e.start);
                            const end =
                                e.end != null
                                    ? new Date(allDay ? `${e.end}T00:00:00.000Z` : e.end)
                                    : undefined;

                            if (Number.isNaN(start.getTime())) {
                                failed.push({ summary: e.summary, reason: 'Invalid start time' });
                                continue;
                            }

                            const { htmlLink } = await insertEvent('primary', {
                                summary: e.summary,
                                start,
                                end,
                                allDay,
                            });

                            const when = allDay
                                ? start.toLocaleDateString()
                                : start.toLocaleString();
                            created.push({ summary: e.summary, when, link: htmlLink });
                        } catch (err: unknown) {
                            if (err instanceof CalendarReauthRequiredError) {
                                await this.sendReauthEmbed(msg, err.authUrl);
                                return;
                            }
                            failed.push({
                                summary: e.summary,
                                reason:
                                    err instanceof Error ? err.message : 'Unknown error',
                            });
                        }
                    }

                    const lines: string[] = [];
                    for (const c of created.slice(0, 10)) {
                        lines.push(`- **${c.summary}** at ${c.when}\n  ${c.link}`);
                    }

                    const embed = new EmbedBuilder()
                        .setTitle(
                            created.length > 0
                                ? `Added ${created.length} event${created.length === 1 ? '' : 's'}`
                                : 'No events added'
                        )
                        .setDescription(
                            [
                                ...(lines.length ? lines : ['(No events were created.)']),
                                ...(failed.length
                                    ? [
                                          '',
                                          `Failed: ${failed
                                              .slice(0, 5)
                                              .map(f => f.summary)
                                              .join(', ')}`,
                                      ]
                                    : []),
                            ].join('\n')
                        )
                        .setColor(created.length ? '#4285F4' : '#ff4a4a');

                    await this.sendReply(msg, embed);
                    return;
                }
            }

            if (!chronoResults || chronoResults.length === 0) {
                await this.sendReply(
                    msg,
                    'I couldn\'t find a date or time in that message. Try something like: `add calendar meeting tomorrow at 2 pm`.'
                );
                return;
            }

            const result = chronoResults[0];
            const startDate = result.date();
            const allDay = !result.start.isCertain('hour');
            let title = body
                .replace(result.text, '')
                .trim()
                .replace(/\s+(at|on)\s*$/i, '')
                .trim();
            if (!title) title = 'Event';

            const { htmlLink } = await insertEvent('primary', {
                summary: title,
                start: startDate,
                allDay,
            });

            const dateString = allDay
                ? startDate.toLocaleDateString()
                : startDate.toLocaleString();
            const timePrefix = allDay ? 'on' : 'at';

            const embed = new EmbedBuilder()
                .setTitle('Event added')
                .setDescription(`**${title}** ${timePrefix} ${dateString}`)
                .setURL(htmlLink)
                .setColor('#4285F4');
            await this.sendReply(msg, embed);
        } catch (error: unknown) {
            if (error instanceof CalendarReauthRequiredError) {
                await this.sendReauthEmbed(msg, error.authUrl);
                return;
            }
            console.error('Add calendar trigger error:', error);
            await this.sendReply(
                msg,
                'Failed to add the event. Check that you have authorized the bot with `/gcalendar` and try again.'
            );
        }
    }

    private async executePendingConfirmation(msg: Message, token: string): Promise<void> {
        const pending = AddCalendarTrigger.pendingConfirmations.get(token);
        if (!pending) {
            await this.sendReply(msg, 'Confirmation token not found. Ask me to schedule it again.');
            return;
        }
        if (pending.userId !== msg.author.id || pending.channelId !== msg.channelId) {
            await this.sendReply(msg, 'That confirmation token is not valid in this conversation.');
            return;
        }
        if (Date.now() - pending.createdAtMs > CONFIRM_TTL_MS) {
            AddCalendarTrigger.pendingConfirmations.delete(token);
            await this.sendReply(msg, 'Confirmation token expired. Please send the request again.');
            return;
        }

        AddCalendarTrigger.pendingConfirmations.delete(token);
        const executed = await executeButlerActions(pending.actions, this.jobStore, {
            userId: msg.author.id,
            channelId: msg.channelId,
        });
        await this.sendReply(msg, this.buildExecutionEmbed('Scheduled after confirmation', executed));
    }

    private buildConfirmationEmbed(
        token: string,
        actions: ButlerAction[],
        reason?: string
    ): EmbedBuilder {
        const lines = actions.map(action => {
            if (action.kind === 'create_calendar_event') {
                return `- Calendar: **${action.summary}** at ${action.start}`;
            }
            return `- Reminder: **${action.text}** at ${action.when}`;
        });

        const reasonLine =
            reason === 'multiple_actions'
                ? 'This request has multiple actions.'
                : reason === 'reminder_requires_confirmation'
                  ? 'Reminders require confirmation.'
                  : 'This action needs confirmation.';

        return new EmbedBuilder()
            .setTitle('Confirm scheduling actions')
            .setDescription(
                [reasonLine, '', ...lines, '', `Reply with \`confirm ${token}\` to run these.`].join(
                    '\n'
                )
            )
            .setColor('#f2b01e');
    }

    private buildExecutionEmbed(
        title: string,
        executions: Array<{ ok: boolean; summary: string; when: string; link?: string; error?: string }>
    ): EmbedBuilder {
        const success = executions.filter(x => x.ok);
        const failed = executions.filter(x => !x.ok);

        const lines = success.map(x => `- **${x.summary}** at ${x.when}${x.link ? `\n  ${x.link}` : ''}`);
        if (failed.length > 0) {
            lines.push(
                '',
                ...failed.slice(0, 5).map(x => `- Failed **${x.summary}**: ${x.error ?? 'Unknown error'}`)
            );
        }

        return new EmbedBuilder()
            .setTitle(title)
            .setDescription(lines.length > 0 ? lines.join('\n') : '(No actions were run.)')
            .setColor(success.length > 0 ? '#4285F4' : '#ff4a4a');
    }

    private createConfirmationToken(): string {
        return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
    }

    private async sendReauthEmbed(msg: Message, authUrl: string): Promise<void> {
        const embed = new EmbedBuilder()
            .setTitle('Google sign-in expired')
            .setDescription(
                'Saved credentials were cleared. Sign in again:\n\n' +
                    `[Authorize Google Calendar](${authUrl})`
            )
            .setColor('#ff4a4a');
        await this.sendReply(msg, embed);
    }

    private async sendReply(msg: Message, content: string | EmbedBuilder): Promise<void> {
        try {
            const payload = typeof content === 'string' ? { content } : { embeds: [content] };
            if ('send' in msg.channel) {
                await msg.channel.send(payload);
            }
        } catch {
            // Channel may be deleted or bot lack permission
        }
    }
}
