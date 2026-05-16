import { REST } from '@discordjs/rest';
import { Client, Options, Partials } from 'discord.js';
import { createRequire } from 'node:module';

import { GCalendarCommand } from './commands/chat/index.js';
import { ChatCommandMetadata, Command } from './commands/index.js';
import Config from './config.js';
import { OAuthController, RootController } from './controllers/index.js';
import { CommandHandler, MessageHandler, TriggerHandler } from './events/index.js';
import { Api } from './models/api.js';
import { Bot } from './models/bot.js';
import { CommandRegistrationService, JobRunner, JobStore, Logger } from './services/index.js';
import { logLocalLlmOllamaProbe } from './services/local-llm-event-parser.js';
import { AddCalendarTrigger, Trigger } from './triggers/index.js';

const require = createRequire(import.meta.url);
let Logs = require('../lang/logs.json');

async function start(): Promise<void> {
    let client = new Client({
        intents: Config.client.intents,
        partials: (Config.client.partials as string[]).map(partial => Partials[partial]),
        makeCache: Options.cacheWithLimits({
            ...Options.DefaultMakeCacheSettings,
            ...Config.client.caches,
        }),
        enforceNonce: true,
    });

    let commands: Command[] = [new GCalendarCommand()];

    const jobStore = new JobStore(Config.reminderJobs.storePath);
    const jobRunner = new JobRunner(client, jobStore, Config.reminderJobs.pollIntervalMs);
    jobRunner.start();

    let triggers: Trigger[] = [new AddCalendarTrigger(jobStore)];

    let commandHandler = new CommandHandler(commands);
    let triggerHandler = new TriggerHandler(triggers);
    let messageHandler = new MessageHandler(triggerHandler);

    let bot = new Bot(
        Config.client.token,
        client,
        messageHandler,
        commandHandler
    );

    let serveHttp = !client.shard || client.shard.ids[0] === 0;
    if (serveHttp) {
        let api = new Api([new OAuthController(), new RootController()]);
        await api.start();
    }

    await logLocalLlmOllamaProbe(Config.localLlm);

    if (process.argv[2] == 'commands') {
        try {
            let rest = new REST({ version: '10' }).setToken(Config.client.token);
            let commandRegistrationService = new CommandRegistrationService(rest);
            let localCmds = [
                ...Object.values(ChatCommandMetadata).sort((a, b) => (a.name > b.name ? 1 : -1)),
            ];
            await commandRegistrationService.process(localCmds, process.argv);
        } catch (error) {
            Logger.error(Logs.error.commandAction, error);
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
        process.exit();
    }

    await bot.start();
}

process.on('unhandledRejection', (reason, _promise) => {
    Logger.error(Logs.error.unhandledRejection, reason);
});

start().catch(error => {
    Logger.error(Logs.error.unspecified, error);
});
