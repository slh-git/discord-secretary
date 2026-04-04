# Discord Secretary (DM Calendar Bot)

This repo is now a slim Discord DM bot focused only on Google Calendar.

## What it does

- Slash command: `/gcalendar` to view upcoming events.
- DM trigger: send `add calendar ...` to create events from natural language.
- OAuth callback endpoint for Google auth: `GET /oauth/callback`.

## Quick start

1. Install dependencies:
   - `npm install`
2. Configure `config/config.json` (or use env vars):
   - `DISCORD_BOT_TOKEN`
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REDIRECT_URI`
3. Register slash commands:
   - `npm run commands:register`
4. Start the bot:
   - `npm start`

## Notes

- This project is DM-only and ignores guild interactions.
- OAuth tokens are stored in `config/google-tokens.json`.
