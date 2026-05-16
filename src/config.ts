/**
 * Single config loader. Reads config.json and overlays environment variables for secrets.
 * Use this instead of require('config/config.json') so secrets can come from env.
 *
 * Env vars (optional; fallback to config.json):
 *   DISCORD_BOT_TOKEN        -> client.token
 *   DISCORD_CLIENT_ID        -> client.id
 *   DISCORD_DEVELOPER_IDS    -> developers (comma-separated Discord user IDs)
 *   API_SECRET               -> api.secret
 *   GOOGLE_CLIENT_ID         -> gCalendar.client_id
 *   GOOGLE_CLIENT_SECRET     -> gCalendar.client_secret
 *   GOOGLE_REDIRECT_URI      -> gCalendar.redirect_uris[0]
 *   LOCAL_LLM_ENABLED        -> localLlm.enabled ("true"|"false")
 *   LOCAL_LLM_BASE_URL       -> localLlm.baseUrl (e.g. http://127.0.0.1:11434)
 *   LOCAL_LLM_MODEL          -> localLlm.model (must match `ollama list`, e.g. gemma45:e2b)
 *   LOCAL_LLM_TIMEOUT_MS     -> localLlm.timeoutMs (wall-clock wait for /api/chat; default 300000)
 *   LOCAL_LLM_TOOL_MAX_ROUNDS -> localLlm.toolMaxRounds (max tool loop turns; default 5)
 *   REMINDER_JOB_STORE_PATH   -> reminderJobs.storePath (default data/reminder-jobs.json)
 *   REMINDER_JOB_POLL_MS      -> reminderJobs.pollIntervalMs (default 15000)
 */
import { config as loadEnv } from 'dotenv';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);

// Load .env from project root when present.
loadEnv({ path: path.resolve(process.cwd(), '.env') });

const fileConfig = require('../config/config.json');

const fileLocalLlm = fileConfig.localLlm ?? {};

const developerIdsFromEnv = process.env.DISCORD_DEVELOPER_IDS?.split(',')
    .map(s => s.trim())
    .filter(Boolean);

const config = {
    ...fileConfig,
    developers: developerIdsFromEnv?.length ? developerIdsFromEnv : fileConfig.developers,
    client: {
        ...fileConfig.client,
        id: process.env.DISCORD_CLIENT_ID ?? fileConfig.client.id,
        token: process.env.DISCORD_BOT_TOKEN ?? fileConfig.client.token,
    },
    api: {
        ...fileConfig.api,
        secret: process.env.API_SECRET ?? fileConfig.api.secret,
    },
    gCalendar: fileConfig.gCalendar
        ? {
              ...fileConfig.gCalendar,
              client_id: process.env.GOOGLE_CLIENT_ID ?? fileConfig.gCalendar.client_id,
              client_secret: process.env.GOOGLE_CLIENT_SECRET ?? fileConfig.gCalendar.client_secret,
              redirect_uris:
                  process.env.GOOGLE_REDIRECT_URI != null
                      ? [process.env.GOOGLE_REDIRECT_URI]
                      : fileConfig.gCalendar.redirect_uris,
          }
        : undefined,
    localLlm: {
        enabled:
            process.env.LOCAL_LLM_ENABLED !== undefined && process.env.LOCAL_LLM_ENABLED !== ''
                ? process.env.LOCAL_LLM_ENABLED.toLowerCase() === 'true'
                : Boolean(fileLocalLlm.enabled),
        baseUrl:
            process.env.LOCAL_LLM_BASE_URL ??
            fileLocalLlm.baseUrl ??
            'http://127.0.0.1:11434',
        model: process.env.LOCAL_LLM_MODEL ?? fileLocalLlm.model ?? 'gemma:2b',
        timeoutMs:
            Number(process.env.LOCAL_LLM_TIMEOUT_MS ?? fileLocalLlm.timeoutMs ?? '300000') ||
            300000,
        toolMaxRounds:
            Number(process.env.LOCAL_LLM_TOOL_MAX_ROUNDS ?? fileLocalLlm.toolMaxRounds ?? '5') ||
            5,
    },
    reminderJobs: {
        storePath:
            process.env.REMINDER_JOB_STORE_PATH ??
            fileConfig.reminderJobs?.storePath ??
            path.join(process.cwd(), 'data', 'reminder-jobs.json'),
        pollIntervalMs:
            Number(process.env.REMINDER_JOB_POLL_MS ?? fileConfig.reminderJobs?.pollIntervalMs ?? '15000') ||
            15000,
    },
};

export default config;
