import { Request, Response, Router } from 'express';

import Config from '../config.js';
import { Controller } from './index.js';
import {
    consumeOAuthState,
    createOAuth2Client,
    saveTokens,
} from '../services/user/gcalendar-auth.js';

export class OAuthController implements Controller {
    public path = '/oauth';
    public router: Router = Router();

    public register(): void {
        this.router.get('/callback', (req, res) => this.callback(req, res));
    }

    private async callback(req: Request, res: Response): Promise<void> {
        try {
            const code = req.query.code as string;
            const state = req.query.state as string;

            if (!code || !state) {
                res.status(400).send('Authorization code or state not found');
                return;
            }

            const userId = consumeOAuthState(state);
            if (!userId) {
                res.status(400).send('Authorization state is invalid or expired');
                return;
            }

            const oauth2Client = createOAuth2Client(Config.gCalendar);
            const { tokens } = await oauth2Client.getToken(code);
            await saveTokens(userId, tokens);

            res.status(200).send(`
                <html>
                    <head><title>Authorization Successful</title></head>
                    <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                        <h1 style="color: #4285F4;">✅ Authorization Successful!</h1>
                        <p>You can now close this window and use the /gcalendar command in Discord.</p>
                    </body>
                </html>
            `);
        } catch {
            res.status(500).send(`
                <html>
                    <head><title>Authorization Failed</title></head>
                    <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                        <h1 style="color: #ff4a4a;">❌ Authorization Failed</h1>
                        <p>Something went wrong. Please try again or re-authorize from Discord.</p>
                    </body>
                </html>
            `);
        }
    }
}
