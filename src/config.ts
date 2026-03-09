/**
 * Single config loader. Reads config.json and overlays environment variables for secrets.
 * Use this instead of require('config/config.json') so secrets can come from env.
 *
 * Env vars (optional; fallback to config.json):
 *   DISCORD_BOT_TOKEN       -> client.token
 *   GOOGLE_CLIENT_ID       -> gCalendar.client_id
 *   GOOGLE_CLIENT_SECRET   -> gCalendar.client_secret
 *   GOOGLE_REDIRECT_URI    -> gCalendar.redirect_uris[0]
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const fileConfig = require('../config/config.json');

const config = {
    ...fileConfig,
    client: {
        ...fileConfig.client,
        token: process.env.DISCORD_BOT_TOKEN ?? fileConfig.client.token,
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
};

export default config;
