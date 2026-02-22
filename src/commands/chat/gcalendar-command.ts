import { ChatInputCommandInteraction, EmbedBuilder, PermissionsString } from 'discord.js';
import { google } from 'googleapis';
import fs from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

import { Language } from '../../models/enum-helpers/index.js';
import { EventData } from '../../models/internal-models.js';
import { Lang } from '../../services/index.js';
import { InteractionUtils } from '../../utils/index.js';
import { Command, CommandDeferType } from '../index.js';

const require = createRequire(import.meta.url);
let Config = require('../../../config/config.json');

// The scope for reading calendar events.
const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];
const TOKEN_PATH = path.join(process.cwd(), 'config', 'google-tokens.json');

export class GCalendarCommand implements Command {
    public names = [Lang.getRef('chatCommands.gcalendar', Language.Default)];
    public deferType = CommandDeferType.PUBLIC;
    public requireClientPerms: PermissionsString[] = [];

    public async execute(intr: ChatInputCommandInteraction, data: EventData): Promise<void> {
        try {
            // Create OAuth2 client with credentials from config
            const oauth2Client = new google.auth.OAuth2(
                Config.gCalendar.client_id,
                Config.gCalendar.client_secret,
                Config.gCalendar.redirect_uris[0]
            );

            // Check if we have stored tokens
            try {
                const tokenData = await fs.readFile(TOKEN_PATH, 'utf-8');
                const tokens = JSON.parse(tokenData);
                oauth2Client.setCredentials(tokens);
            } catch (error) {
                // No tokens found, need to authorize
                const authUrl = oauth2Client.generateAuthUrl({
                    access_type: 'offline',
                    scope: SCOPES,
                });

                const embed = new EmbedBuilder()
                    .setTitle('Google Calendar Authorization Required')
                    .setDescription(
                        `Please authorize this bot to access your Google Calendar:\n\n` +
                            `[Click here to authorize](${authUrl})\n\n` +
                            `After authorization, the page will redirect and save your credentials.`
                    )
                    .setColor('#4285F4');

                await InteractionUtils.send(intr, embed);
                return;
            }

            // Create a new Calendar API client.
            const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

            // Get the list of events.
            const result = await calendar.events.list({
                calendarId: 'primary',
                timeMin: new Date().toISOString(),
                maxResults: 10,
                singleEvents: true,
                orderBy: 'startTime',
            });

            const events = result.data.items;

            if (!events || events.length === 0) {
                await InteractionUtils.send(
                    intr,
                    Lang.getEmbed('displayEmbeds.noUpcomingEvents', data.lang)
                );
                return;
            }

            // Build the embed with upcoming events
            const embed = new EmbedBuilder()
                .setTitle('📅 Upcoming 10 Events')
                .setColor('#4285F4') // Google Calendar blue
                .setTimestamp();

            // Add each event as a field
            for (const event of events) {
                const start = event.start?.dateTime ?? event.start?.date;
                const eventDate = start ? new Date(start).toLocaleString() : 'No date';
                embed.addFields({
                    name: event.summary || 'No title',
                    value: eventDate,
                    inline: false,
                });
            }

            await InteractionUtils.send(intr, embed);
        } catch (error) {
            console.error('Error fetching calendar events:', error);
            await InteractionUtils.send(
                intr,
                Lang.getEmbed('errorEmbeds.calendarError', data.lang)
            );
        }
    }
}
