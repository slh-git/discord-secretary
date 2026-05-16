import fs from 'node:fs/promises';
import path from 'node:path';

export interface ReminderJob {
    id: string;
    userId: string;
    channelId: string;
    dueAtIso: string;
    text: string;
    createdAtIso: string;
    status: 'pending' | 'sent' | 'failed' | 'cancelled';
    lastError?: string;
}

interface JobsFile {
    reminders: ReminderJob[];
}

function createId(): string {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export class JobStore {
    private readonly filePath: string;
    private writeQueue: Promise<void> = Promise.resolve();

    constructor(filePath?: string) {
        this.filePath =
            filePath ??
            path.join(process.cwd(), 'data', 'reminder-jobs.json');
    }

    public async enqueueReminder(input: {
        userId: string;
        channelId: string;
        dueAtIso: string;
        text: string;
    }): Promise<ReminderJob> {
        const job: ReminderJob = {
            id: createId(),
            userId: input.userId,
            channelId: input.channelId,
            dueAtIso: input.dueAtIso,
            text: input.text.trim(),
            createdAtIso: new Date().toISOString(),
            status: 'pending',
        };

        await this.update(data => {
            data.reminders.push(job);
        });
        return job;
    }

    public async listDueReminders(now: Date, limit: number = 20): Promise<ReminderJob[]> {
        const data = await this.read();
        return data.reminders
            .filter(r => r.status === 'pending' && new Date(r.dueAtIso).getTime() <= now.getTime())
            .slice(0, limit);
    }

    public async markReminderSent(id: string): Promise<void> {
        await this.update(data => {
            const job = data.reminders.find(r => r.id === id);
            if (!job) return;
            job.status = 'sent';
            job.lastError = undefined;
        });
    }

    public async markReminderFailed(id: string, lastError: string): Promise<void> {
        await this.update(data => {
            const job = data.reminders.find(r => r.id === id);
            if (!job) return;
            job.status = 'failed';
            job.lastError = lastError;
        });
    }

    private async update(mutator: (data: JobsFile) => void): Promise<void> {
        this.writeQueue = this.writeQueue.then(async () => {
            const data = await this.read();
            mutator(data);
            await this.write(data);
        });
        await this.writeQueue;
    }

    private async read(): Promise<JobsFile> {
        try {
            const raw = await fs.readFile(this.filePath, 'utf8');
            const parsed = JSON.parse(raw) as Partial<JobsFile>;
            return {
                reminders: Array.isArray(parsed.reminders) ? parsed.reminders : [],
            };
        } catch (err: unknown) {
            const code = (err as NodeJS.ErrnoException)?.code;
            if (code === 'ENOENT') {
                return { reminders: [] };
            }
            throw err;
        }
    }

    private async write(data: JobsFile): Promise<void> {
        await fs.mkdir(path.dirname(this.filePath), { recursive: true });
        await fs.writeFile(this.filePath, JSON.stringify(data, null, 2));
    }
}
