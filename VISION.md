# Discord Secretary — Product Vision

## Goal

Use the bot in Discord by **saying something in plain language** and have it add the event to your Google Calendar.

**Example:** In any channel (or DM), you write:

> add calendar that I have a dentist appointment at Wednesday 3 pm

The bot creates that event in your Google Calendar and confirms in chat.

## How it works

1. **Connect your calendar once**  
   Run `/gcalendar` and follow the link to authorize the bot with your Google account. Your tokens are stored so the bot can read and create events.

2. **Add events by typing**  
   Send a message that starts with **add calendar** or **add event**, then describe the event and when it is, e.g.:
   - `add calendar dentist appointment Wednesday 3 pm`
   - `add event team standup tomorrow at 9 am`
   - `add calendar meeting next Friday at 2:30 pm`

3. The bot parses the text, creates the event in your primary Google Calendar, and replies with a confirmation and a link to the event.

## Technical direction

- **Single user (you)** for now: one Google account linked via one token file. Multi-user support would require per-user tokens and storage.
- **Natural language → calendar create**: a Trigger handles “add calendar …” messages, uses a date parser (e.g. Chrono) to get title and time, then calls the Calendar API to insert the event.
- **Slash command** `/gcalendar` remains for listing upcoming events and for the initial OAuth flow.

This vision keeps the project focused so that future work (and any agents) can align on: *say it in Discord → bot adds it to my calendar*.
