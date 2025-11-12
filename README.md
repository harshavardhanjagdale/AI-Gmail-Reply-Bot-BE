# Email Understanding & Action Bot - Backend (Node.js)

## Overview
This backend provides:
- Google OAuth2 login (server-side) to get Gmail access tokens.
- Fetching email metadata and bodies from Gmail.
- Sending email content to OpenAI to classify intent and suggest actions.
- A lightweight local DB (lowdb) stored in `db.json`.

## What's included
- `server.js` - app entrypoint
- `routes/auth.js` - OAuth routes (login, callback)
- `routes/gmail.js` - Gmail-related routes (list/fetch emails)
- `controllers/emailController.js` - orchestrates classification + action suggestion
- `services/gmailService.js` - wrappers around googleapis Gmail calls
- `services/openaiService.js` - wrapper to call OpenAI (replace API key)
- `db.json` - sample LowDB file
- `.env.example` - environment variables

## Quick start (local)
1. Copy `.env.example` to `.env` and fill values (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, OPENAI_API_KEY, BASE_URL).
2. `npm install`
3. `npm run dev` (or `npm start`)
4. Visit: `http://localhost:3000/auth/login` to start Google OAuth flow.

## Next steps & enhancements
1. Frontend integration: implement Angular OAuth flow or use server-side login and forward token to frontend.
2. Secure refresh token storage (encrypt before putting in db).
3. Implement webhook handlers (n8n) to push classification results.
4. Add unit tests, logging, and rate-limiters.
5. Harden CORS and add role-based access control.

