import { ChatInputCommandInteraction, EmbedBuilder, PermissionsString } from 'discord.js';

import Config from '../../config.js';
import { Language } from '../../models/enum-helpers/index.js';
import { EventData } from '../../models/internal-models.js';
import {
    createOAuth2Client,
    getAuthenticatedClient,
    SCOPES,
} from '../../services/gcalendar-auth.js';
import { Lang } from '../../services/index.js';
import { InteractionUtils } from '../../utils/index.js';
import { Command, CommandDeferType } from '../index.js';

export class GCalendarCommand implements Command {
    public names = [Lang.getRef('chatCommands.gcalendar', Language.Default)];
    public deferType = CommandDeferType.PUBLIC;
    public requireClientPerms: PermissionsString[] = [];

    public async execute(intr: ChatInputCommandInteraction, data: EventData): Promise<void> {
        try {
            const oauth2Client = createOAuth2Client(Config.gCalendar);

            let calendar;
            try {
                const auth = await getAuthenticatedClient(Config.gCalendar);
                calendar = auth.calendar;
            } catch {
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

            const embed = new EmbedBuilder()
                .setTitle('📅 Upcoming 10 Events')
                .setColor('#4285F4')
                .setTimestamp();

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
