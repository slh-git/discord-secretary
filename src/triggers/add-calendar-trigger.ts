import { EmbedBuilder, Message } from 'discord.js';
import * as chrono from 'chrono-node';

import Config from '../config.js';
import { EventData } from '../models/internal-models.js';
import { insertEvent } from '../services/calendar-service.js';
import { getAuthenticatedClient } from '../services/gcalendar-auth.js';
import { Trigger } from './trigger.js';

const ADD_CALENDAR_REGEX = /^add\s+(?:calendar|event)\s+(.+)$/i;

export class AddCalendarTrigger implements Trigger {
    public requireGuild = false;

    public triggered(msg: Message): boolean {
        if (!msg.content || msg.author.bot) return false;
        return ADD_CALENDAR_REGEX.test(msg.content.trim());
    }

    public async execute(msg: Message, data: EventData): Promise<void> {
        const match = msg.content.trim().match(ADD_CALENDAR_REGEX);
        if (!match) return;

        if (!Config.gCalendar) {
            await this.sendReply(msg, 'Calendar integration is not configured.');
            return;
        }

        const body = match[1].trim();
        if (!body) {
            await this.sendReply(msg, 'Please add a description and time, e.g. `add calendar dentist appointment Wednesday 3 pm`.');
            return;
        }

        const results = chrono.parse(body);
        if (!results || results.length === 0) {
            await this.sendReply(msg, "I couldn't find a date or time in that message. Try something like: `add calendar meeting tomorrow at 2 pm`.");
            return;
        }

        const result = results[0];
        const startDate = result.date();
        let title = body
            .replace(result.text, '')
            .trim()
            .replace(/\s+(at|on)\s*$/i, '')
            .trim();
        if (!title) title = 'Event';

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

        try {
            const { htmlLink } = await insertEvent('primary', {
                summary: title,
                start: startDate,
            });

            const embed = new EmbedBuilder()
                .setTitle('Event added')
                .setDescription(`**${title}** at ${startDate.toLocaleString()}`)
                .setURL(htmlLink)
                .setColor('#4285F4');
            await this.sendReply(msg, embed);
        } catch (error) {
            console.error('Add calendar trigger error:', error);
            await this.sendReply(
                msg,
                'Failed to add the event. Check that you have authorized the bot with `/gcalendar` and try again.'
            );
        }
    }

    private async sendReply(
        msg: Message,
        content: string | EmbedBuilder
    ): Promise<void> {
        try {
            const payload =
                typeof content === 'string' ? { content } : { embeds: [content] };
            await msg.channel.send(payload);
        } catch {
            // Channel may be deleted or bot lack permission
        }
    }
}
