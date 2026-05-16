import { Client } from 'discord.js';

import { JobStore } from './job-store.js';
import { Logger } from './logger.js';

function unknownToErrorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    try {
        return JSON.stringify(err);
    } catch {
        return 'Unknown error';
    }
}

function isSendableChannel(value: unknown): value is { send: (content: string) => Promise<unknown> } {
    return (
        typeof value === 'object' &&
        value !== null &&
        'send' in value &&
        typeof (value as { send?: unknown }).send === 'function'
    );
}

export class JobRunner {
    private intervalHandle: NodeJS.Timeout | undefined;
    private ticking = false;

    constructor(
        private readonly client: Client,
        private readonly jobStore: JobStore,
        private readonly pollIntervalMs: number = 15_000
    ) {}

    public start(): void {
        if (this.intervalHandle) return;
        this.intervalHandle = setInterval(() => {
            void this.tick();
        }, this.pollIntervalMs);
    }

    public stop(): void {
        if (!this.intervalHandle) return;
        clearInterval(this.intervalHandle);
        this.intervalHandle = undefined;
    }

    private async tick(): Promise<void> {
        if (this.ticking) return;
        if (!this.client.isReady()) return;
        this.ticking = true;

        try {
            const due = await this.jobStore.listDueReminders(new Date(), 25);
            for (const job of due) {
                try {
                    if (job.channelId) {
                        const channel = await this.client.channels.fetch(job.channelId);
                        if (isSendableChannel(channel)) {
                            await channel.send(`<@${job.userId}> reminder: ${job.text}`);
                        } else {
                            throw new Error('Target channel not found or cannot send');
                        }
                    } else {
                        const user = await this.client.users.fetch(job.userId);
                        await user.send(`Reminder: ${job.text}`);
                    }

                    await this.jobStore.markReminderSent(job.id);
                } catch (err: unknown) {
                    const message = unknownToErrorMessage(err);
                    await this.jobStore.markReminderFailed(job.id, message);
                    Logger.warn('Reminder job failed.', { jobId: job.id, error: message });
                }
            }
        } finally {
            this.ticking = false;
        }
    }
}
