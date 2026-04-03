import { Message } from 'discord.js';

import { EventHandler, TriggerHandler } from './index.js';

export class MessageHandler implements EventHandler {
    constructor(private triggerHandler: TriggerHandler) {}

    public async process(msg: Message): Promise<void> {
        if (msg.guild) {
            return;
        }

        if (msg.system || msg.author.id === msg.client.user?.id) {
            return;
        }

        await this.triggerHandler.process(msg);
    }
}
