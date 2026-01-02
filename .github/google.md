# Google Calendar API OAuth2 Integration Guide

Complete guide for integrating Google Calendar API with OAuth2 authentication, including setup, implementation, testing, and troubleshooting.

## Table of Contents
1. [Google Cloud Console Setup](#google-cloud-console-setup)
2. [OAuth2 Flow Implementation](#oauth2-flow-implementation)
3. [API Scopes and Permissions](#api-scopes-and-permissions)
4. [Token Management](#token-management)
5. [Calendar API Usage](#calendar-api-usage)
6. [Testing Strategy](#testing-strategy)
7. [Error Handling](#error-handling)
8. [Production Considerations](#production-considerations)

---

## Google Cloud Console Setup

### Step 1: Create Google Cloud Project

1. Navigate to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **Select a project** → **New Project**
3. Enter project name: `discord-secretary` (or your preferred name)
4. Select organization (if applicable) or leave as "No organization"
5. Click **Create**
6. Wait for project creation (notification appears in top-right)

### Step 2: Enable Google Calendar API

1. In the project dashboard, click **APIs & Services** → **Library**
2. Search for "Google Calendar API"
3. Click on **Google Calendar API** from results
4. Click **Enable** button
5. Wait for API to be enabled (takes a few seconds)

### Step 3: Configure OAuth Consent Screen

**Important**: This is required before creating credentials.

#### For External User Type (Testing Phase):
1. Go to **APIs & Services** → **OAuth consent screen**
2. Select **External** user type → Click **Create**
3. Fill in required fields:
   - **App name**: `Discord Secretary` (or your bot name)
   - **User support email**: Your email address
   - **App logo** (optional): Upload a 120x120px image
   - **Application home page** (optional): Your project URL
   - **Authorized domains**: Leave empty for ngrok testing
   - **Developer contact information**: Your email address
4. Click **Save and Continue**

#### Scopes Configuration:
1. Click **Add or Remove Scopes**
2. Filter for "calendar"
3. Select the following scopes:
   - `.../auth/calendar.readonly` - See all your calendars
   - `.../auth/calendar.events.readonly` - View events on all calendars (optional, for future use)
4. Click **Update** → **Save and Continue**

#### Test Users (External Apps Only):
1. Click **Add Users**
2. Enter email addresses that will test the integration
3. Maximum 100 test users during testing phase
4. Click **Add** → **Save and Continue**

### Step 4: Create OAuth2 Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Select **Application type**: Web application
4. Enter **Name**: `Discord Bot OAuth Client`
5. **Authorized JavaScript origins**: Leave empty
6. **Authorized redirect URIs**:
   - For local development with ngrok: `https://YOUR-NGROK-URL/oauth/google/callback`
   - For production: `https://yourdomain.com/oauth/google/callback`
   - Note: You can add multiple URIs (add both if needed)
7. Click **Create**
8. Copy **Client ID** and **Client Secret** immediately
9. Store in `.env` file:
   ```env
   GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=your-client-secret
   GOOGLE_REDIRECT_URI=https://your-ngrok-url/oauth/google/callback