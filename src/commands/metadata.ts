import {
    ApplicationCommandType,
    RESTPostAPIChatInputApplicationCommandsJSONBody,
} from 'discord.js';

import { Language } from '../models/enum-helpers/index.js';
import { Lang } from '../services/index.js';

export const ChatCommandMetadata: {
    [command: string]: RESTPostAPIChatInputApplicationCommandsJSONBody;
} = {
    GCALENDAR: {
        type: ApplicationCommandType.ChatInput,
        name: Lang.getRef('chatCommands.gcalendar', Language.Default),
        name_localizations: Lang.getRefLocalizationMap('chatCommands.gcalendar'),
        description: Lang.getRef('commandDescs.gcalendar', Language.Default),
        description_localizations: Lang.getRefLocalizationMap('commandDescs.gcalendar'),
        dm_permission: true,
        default_member_permissions: undefined,
    },
};
