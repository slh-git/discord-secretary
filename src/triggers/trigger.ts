import { Message } from 'discord.js';

export interface Trigger {
    triggered(msg: Message): boolean;
    execute(msg: Message): Promise<void>;
}
