# Discord Secretary (DM Calendar Bot)

This repo is now a slim Discord DM bot focused only on Google Calendar.

## What it does

- Slash command: `/gcalendar` to view upcoming events.
- DM trigger: send `add calendar ...` to create events from natural language.
- OAuth callback endpoint for Google auth: `GET /oauth/callback`.

## Quick start

1. Install dependencies:
  - `npm install`
2. Configure `config/config.json` placeholders and set env vars (copy `.env.example` to `.env` if desired). The app auto-loads `.env` on startup:
  - `DISCORD_BOT_TOKEN`
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `GOOGLE_REDIRECT_URI`
  - (optional, for stronger multi-event parsing) `LOCAL_LLM_ENABLED`, `LOCAL_LLM_BASE_URL`, `LOCAL_LLM_MODEL`
3. Register slash commands:
  - `npm run commands:register`
4. Start the bot:
  - `npm start`

## Notes

- This project is DM-only and ignores guild interactions.
- OAuth tokens are stored in `config/google-tokens.json` after the first successful auth callback.

## How “add calendar / add event” works

Messages are handled only in **DMs**. Only users listed in `developers` (via `config/config.json` or `DISCORD_DEVELOPER_IDS` in `.env`) can use this.

1. **Trigger**
  A DM whose content matches `add calendar …` or `add event …` (case-insensitive) runs `[src/triggers/add-calendar-trigger.ts](src/triggers/add-calendar-trigger.ts)`. Everything after that prefix is the **body** text to interpret.
2. **Google Calendar**
  The bot checks that Calendar OAuth is configured and that tokens exist (same flow as `/gcalendar`). If not connected, it replies with instructions to authorize.
3. **Two parsing paths**
  - **Multiple events (local LLM)**  
   If the body **looks like more than one event**, the bot tries a **local Ollama** model first:
    - Heuristics: the word **and**, a **comma**, or **more than one** date/time found by [chrono-node](https://github.com/wanasit/chrono).
    - When `LOCAL_LLM_ENABLED=true`, it calls `POST {LOCAL_LLM_BASE_URL}/api/chat` (Ollama chat API) from `[src/services/local-llm-event-parser.ts](src/services/local-llm-event-parser.ts)`. The model must return **JSON** with an `events` array: each item has `summary`, `start` (ISO string), optional `end`, optional `allDay`.
    - For each parsed event, the bot creates a Google Calendar event via `[insertEvent](src/services/calendar-service.ts)` and replies with an embed listing what was added (and any failures).
  - **Single event (chrono only)**  
  If the message does **not** match the “multiple” heuristics above, the LLM is disabled, the LLM request **fails** (timeout or error), or it returns **no** parsable events, the bot uses **chrono-node** on the body: it takes the **first** parsed date/time, strips that text from the title, and creates **one** event. If chrono finds no date at all, it asks for a clearer message.
4. **Remote Ollama**
  `LOCAL_LLM_BASE_URL` can point to another machine on your LAN (for example `http://192.168.2.63:11434`). The model name must match what `ollama list` shows (for example `gemma4:e2b`). The bot does not ship Ollama; it only speaks HTTP to whatever you configure.
5. **Environment variables** (see `[.env.example](.env.example)`)

  | Variable               | Purpose                                                     |
  | ---------------------- | ----------------------------------------------------------- |
  | `LOCAL_LLM_ENABLED`    | `true` to use Ollama for multi-event parsing                |
  | `LOCAL_LLM_BASE_URL`   | Ollama base URL (no path; default `http://127.0.0.1:11434`) |
  | `LOCAL_LLM_MODEL`      | Model tag, e.g. `gemma4:e2b`                                |
  | `LOCAL_LLM_TIMEOUT_MS` | HTTP timeout for the chat request (default **120000** ms; large remote models may need more) |


## Troubleshooting

- **`Request timed out` (Ollama)**  
  Large models (for example `gemma4:e2b`) on a **remote** host can take longer than a few seconds, especially on first load. Increase `LOCAL_LLM_TIMEOUT_MS` (for example `180000` or `300000`). On the Ollama machine, warm the model once: `ollama run gemma4:e2b "hi"`.

- **`invalid_grant` when calling Google Calendar**  
  The refresh token in `config/google-tokens.json` no longer works with your OAuth client (revoked access, wrong client id/secret, password reset, etc.). The bot clears that file automatically when it detects `invalid_grant`, then sends a fresh **Authorize** link (see `/gcalendar` or the DM reply). Confirm `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URI` match your Google Cloud OAuth client if sign-in keeps failing.

