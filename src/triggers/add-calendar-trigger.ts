import * as chrono from 'chrono-node';
import { EmbedBuilder, Message } from 'discord.js';

import Config from '../config.js';
import { Trigger } from './trigger.js';
import { insertEvent } from '../services/calendar-service.js';
import {
    CalendarReauthRequiredError,
    getAuthenticatedClient,
} from '../services/gcalendar-auth.js';
import { parseEventsWithLocalLlm } from '../services/local-llm-event-parser.js';

const ADD_CALENDAR_REGEX = /^add\s+(?:calendar|event)\s+(.+)$/i;

export class AddCalendarTrigger implements Trigger {
    public triggered(msg: Message): boolean {
        if (!msg.content || msg.author.bot) return false;
        if (!Config.developers.includes(msg.author.id)) return false;
        return ADD_CALENDAR_REGEX.test(msg.content.trim());
    }

    public async execute(msg: Message): Promise<void> {
        const match = msg.content.trim().match(ADD_CALENDAR_REGEX);
        if (!match) return;

        if (!Config.gCalendar) {
            await this.sendReply(msg, 'Calendar integration is not configured.');
            return;
        }

        const body = match[1].trim();
        if (!body) {
            await this.sendReply(
                msg,
                'Please add a description and time, e.g. `add calendar dentist appointment Wednesday 3 pm`.'
            );
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

        const now = new Date();
        const chronoResults = chrono.parse(body, now, { forwardDate: true });

        try {
            // When LOCAL_LLM_ENABLED=true, always try Ollama first (not only "multi-looking"
            // messages). Single-event phrases were previously skipped and never hit the LLM.
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
                    "I couldn't find a date or time in that message. Try something like: `add calendar meeting tomorrow at 2 pm`."
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
