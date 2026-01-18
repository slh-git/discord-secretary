import { Request, Response, Router } from 'express';
import { google } from 'googleapis';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import path from 'node:path';

import { Controller } from './index.js';

const require = createRequire(import.meta.url);
let Config = require('../../config/config.json');

const TOKEN_PATH = path.join(process.cwd(), 'config', 'google-tokens.json');
const SCOPES = ['https://www.googleapis.com/auth/calendar.readonly'];

export class OAuthController implements Controller {
    public path = '/oauth';
    public router: Router = Router();

    public register(): void {
        this.router.get('/callback', (req, res) => this.callback(req, res));
    }

    private async callback(req: Request, res: Response): Promise<void> {
        try {
            const code = req.query.code as string;

            if (!code) {
                res.status(400).send('Authorization code not found');
                return;
            }

            // Create OAuth2 client
            const oauth2Client = new google.auth.OAuth2(
                Config.gCalendar.client_id,
                Config.gCalendar.client_secret,
                Config.gCalendar.redirect_uris[0]
            );

            // Exchange code for tokens
            const { tokens } = await oauth2Client.getToken(code);

            // Save tokens to file
            await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2));

            res.status(200).send(`
                <html>
                    <head><title>Authorization Successful</title></head>
                    <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                        <h1 style="color: #4285F4;">✅ Authorization Successful!</h1>
                        <p>You can now close this window and use the /gcalendar command in Discord.</p>
                    </body>
                </html>
            `);
        } catch (error) {
            console.error('Error handling OAuth callback:', error);
            res.status(500).send(`
                <html>
                    <head><title>Authorization Failed</title></head>
                    <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                        <h1 style="color: #ff4a4a;">❌ Authorization Failed</h1>
                        <p>Error: ${error.message}</p>
                    </body>
                </html>
            `);
        }
    }
}
