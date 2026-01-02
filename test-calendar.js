// API DOCs: https://googleapis.dev/nodejs/googleapis/latest/calendar/classes/Calendar.html

// Load environment variables from .env file (your Google Client ID/Secret)
import 'dotenv/config';
// Import Google APIs client, HTTP server, URL parser, async file system, path utilities
import { google } from 'googleapis';
import http from 'http';
import { URL } from 'url';
import fs from 'fs/promises';
import path from 'path';
import * as accountManager from './google-account-manager.js';

// Get account ID from command line args (e.g., "node test-calendar.js work")
const accountId = process.argv[2];

if (!accountId) {
  console.error('❌ Error: Account ID required');
  console.log('\nUsage: node test-calendar.js <accountId>');
  console.log('Example: node test-calendar.js work\n');
  console.log('To list accounts: node manage-accounts.js list');
  process.exit(1);
}

// Create OAuth2 client with credentials and callback URL (where Google redirects after login)
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  'http://localhost:3000/oauth2callback'
);

// Request read-only access to user's calendar (can't modify events)
const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];

// If tokens exist, skip OAuth flow - just load them, fetch calendar data, and exit
const savedTokens = await accountManager.loadTokens(accountId);

if (savedTokens) {
  console.log(`✅ Found saved tokens for account: ${accountId}\n`);
  oauth2Client.setCredentials(savedTokens);
  await fetchCalendarData();
  process.exit(0);
}

// Check if account is registered
const accountExists = await accountManager.accountExists(accountId);
if (!accountExists) {
  console.error(`❌ Account '${accountId}' not found in registry.`);
  console.log(`\nPlease add the account first using:`);
  console.log(`node manage-accounts.js add ${accountId}\n`);
  process.exit(1);
}

// Generate Google login URL with permissions request (offline = get refresh token)
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: SCOPES,
  prompt: 'consent', // Force consent screen to get refresh token
});

// Display URL for user to click and authorize
console.log(`🔐 Authorize account '${accountId}' by visiting this URL:`);
console.log(authUrl);
console.log('\n📝 Waiting for OAuth callback on http://localhost:3000/oauth2callback...\n');

// Create temporary web server to receive OAuth callback
const server = http.createServer(async (req, res) => {
  try {
    // Parse incoming request and check if it's the OAuth callback
    const url = new URL(req.url, `http://${req.headers.host}`);
    
    if (url.pathname === '/oauth2callback') {
      // Extract authorization code from URL; show error if missing
      const code = url.searchParams.get('code');
      
      if (!code) {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<h1>Error: No authorization code received</h1>');
        return;
      }

      // Exchange authorization code for actual access/refresh tokens
      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);
      
      // Save tokens to file for future runs
      await accountManager.saveTokens(accountId, tokens);
      
      // Show success page in browser
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<h1>✅ Authorization successful!</h1><p>Account '${accountId}' is now connected. Check your terminal for calendar data. You can close this window.</p>`);
      
      // Fetch calendar data and shut down the temporary server
      await fetchCalendarData();
      
      server.close();
    }
  } catch (error) {
    console.error('❌ Error handling OAuth callback:', error.message);
    res.writeHead(500, { 'Content-Type': 'text/html' });
    res.end('<h1>Error during authorization</h1>');
    server.close();
  }
});

server.listen(3000);

async function fetchCalendarData() {
  try {
    // Create Calendar API client authenticated with OAuth tokens
    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    
    console.log('📅 Fetching calendar list...\n');
    
    // Get account info to display email
    const accountMetadata = await accountManager.getAccount(accountId);
    console.log(`👤 Account: ${accountId}${accountMetadata?.email ? ` (${accountMetadata.email})` : ''}\n`);
    
    // Get list of all calendars the user has access to
    const calendarList = await calendar.calendarList.list();
    
    // Print each calendar's name and ID
    console.log('📋 Your Calendars:');
    console.log('==================');
    calendarList.data.items.forEach((cal, index) => {
      console.log(`${index + 1}. ${cal.summary} (${cal.id})`);
    });
    
    console.log('\n📆 Fetching upcoming events from primary calendar...\n');
    
    const now = new Date();
    // Fetch next 10 upcoming events from primary calendar (starting from now)
    // singleEvents: true - expands recurring events into individual instances
    // orderBy: 'startTime' - sorts chronologically
    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: now.toISOString(),
      maxResults: 10,
      singleEvents: true,
      orderBy: 'startTime',
    });
    
    const events = response.data.items;
    
    if (!events || events.length === 0) {
      console.log('No upcoming events found.');
    } else {
      console.log('📌 Upcoming Events:');
      console.log('===================');
      events.forEach((event, index) => {
        // dateTime for timed events, date for all-day events
        const start = event.start.dateTime || event.start.date;
        const end = event.end.dateTime || event.end.date;
        console.log(`\n${index + 1}. ${event.summary}`);
        console.log(`   Start: ${start}`);
        console.log(`   End: ${end}`);
        // Optionally print description and location if they exist
        if (event.description) {
          console.log(`   Description: ${event.description}`);
        }
        if (event.location) {
          console.log(`   Location: ${event.location}`);
        }
      });
    }
    
    console.log('\n✅ Calendar data fetch complete!');
    
  } catch (error) {
    // Catch and display any API errors with details
    console.error('❌ Error fetching calendar data:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
  }
}
