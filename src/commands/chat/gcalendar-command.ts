import { ChatInputCommandInteraction, EmbedBuilder } from 'discord.js';

import Config from '../../config.js';
import {
    createOAuth2Client,
    getAuthenticatedClient,
    invalidateTokensAndGetAuthUrl,
    isGoogleInvalidGrant,
    SCOPES,
} from '../../services/gcalendar-auth.js';
import { InteractionUtils } from '../../utils/index.js';
import { Command, CommandDeferType } from '../index.js';

export class GCalendarCommand implements Command {
    public names = ['gcalendar'];
    public deferType = CommandDeferType.PUBLIC;

    public async execute(intr: ChatInputCommandInteraction): Promise<void> {
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
                await InteractionUtils.send(intr, 'No upcoming events found.');
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
            if (isGoogleInvalidGrant(error) && Config.gCalendar) {
                const authUrl = await invalidateTokensAndGetAuthUrl(Config.gCalendar);
                const embed = new EmbedBuilder()
                    .setTitle('Google sign-in expired')
                    .setDescription(
                        'Saved credentials were cleared. Sign in again to issue a new refresh token:\n\n' +
                            `[Authorize Google Calendar](${authUrl})\n\n` +
                            'If this keeps happening, confirm `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` match your Google Cloud OAuth client.'
                    )
                    .setColor('#ff4a4a');
                await InteractionUtils.send(intr, embed);
                return;
            }
            await InteractionUtils.send(
                intr,
                'Unable to fetch calendar events right now. Please try again.'
            );
        }
    }
}
