import {
    ApplicationCommandType,
    RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';

export const ChatCommandMetadata: {
    [command: string]: RESTPostAPIChatInputApplicationCommandsJSONBody;
} = {
    GCALENDAR: {
        type: ApplicationCommandType.ChatInput,
        name: 'gcalendar',
        description: 'View upcoming Google Calendar events',
        dm_permission: true,
        default_member_permissions: undefined,
    },
};
