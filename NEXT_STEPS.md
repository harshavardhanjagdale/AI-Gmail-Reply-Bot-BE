# ✅ Next Steps - You're Almost Ready!

## Current Status
✅ MySQL database created  
✅ Tables created (users, emails)  
✅ Database connection configured  
✅ SQL syntax errors fixed  
✅ Migration logic removed  

## What You Need to Do Next

### Step 1: Update .env File with API Credentials

Open your `.env` file and update these values:

```env
# Google OAuth2 - REQUIRED for login
GOOGLE_CLIENT_ID=your_actual_google_client_id_here
GOOGLE_CLIENT_SECRET=your_actual_google_client_secret_here

# OpenAI - REQUIRED for email classification
OPENAI_API_KEY=your_actual_openai_api_key_here
```

**Where to get these:**

1. **Google OAuth Credentials:**
   - Go to: https://console.cloud.google.com/
   - Create a new project (or use existing)
   - Enable Gmail API
   - Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client ID"
   - Application type: Web application
   - Authorized redirect URIs: `http://localhost:3000/auth/google/callback`
   - Copy Client ID and Client Secret

2. **OpenAI API Key:**
   - Go to: https://platform.openai.com/api-keys
   - Create a new API key
   - Copy the key (starts with `sk-`)

### Step 2: Start the Server

```bash
npm run dev
```

You should see:
```
🚀 Server listening on port 3000
📊 Database: email_reply_bot
✅ Database initialization complete
```

### Step 3: Test the Application

1. **Test Server Health:**
   ```bash
   # Open browser or use curl
   http://localhost:3000
   ```
   Should return: `{"ok":true,"message":"Email Action Bot Backend running"}`

2. **Test Login Endpoint:**
   ```bash
   http://localhost:3000/auth/login
   ```
   Should return: `{"url":"https://accounts.google.com/..."}`

3. **Complete OAuth Flow:**
   - Visit: `http://localhost:3000/auth/login`
   - You'll get a URL - open it in browser
   - Complete Google OAuth login
   - You'll be redirected back with a `userId`
   - This `userId` is stored in MySQL with encrypted tokens

4. **Test Email Fetching:**
   ```bash
   # Use the userId from step 3
   http://localhost:3000/gmail/list/YOUR_USER_ID
   ```
   Should return your Gmail messages

### Step 4: Verify Data in MySQL

Check that user data is being stored:

```sql
-- Connect to MySQL
mysql -u root -p

USE email_reply_bot;

-- Check users table
SELECT id, created_at FROM users;

-- Check emails table (after fetching emails)
SELECT id, user_id, subject, created_at FROM emails LIMIT 10;
```

## Quick Test Checklist

- [ ] `.env` file has Google OAuth credentials
- [ ] `.env` file has OpenAI API key
- [ ] Server starts without errors (`npm run dev`)
- [ ] Can access `http://localhost:3000`
- [ ] Can get login URL from `/auth/login`
- [ ] Can complete OAuth flow
- [ ] User appears in MySQL `users` table after login
- [ ] Can fetch emails using `/gmail/list/:userId`
- [ ] Emails appear in MySQL `emails` table after classification

## Troubleshooting

### Server won't start
- Check MySQL is running: `mysql -u root -p`
- Verify `.env` file exists and has correct MySQL credentials
- Check port 3000 is not in use

### OAuth login fails
- Verify `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are correct
- Check redirect URI matches: `http://localhost:3000/auth/google/callback`
- Make sure Gmail API is enabled in Google Cloud Console

### Email classification fails
- Verify `OPENAI_API_KEY` is correct
- Check you have credits in your OpenAI account
- Verify the API key has proper permissions

### Database connection errors
- Verify MySQL is running
- Check credentials in `.env`: `DB_HOST`, `DB_USER`, `DB_PASSWORD`
- Test connection: `mysql -u root -p1234`

## You're Ready! 🎉

Once you've completed these steps, your application will:
- ✅ Store user OAuth tokens securely (encrypted in MySQL)
- ✅ Store email classifications in MySQL
- ✅ Support multiple users with data isolation
- ✅ Work in production-ready mode

Good luck! 🚀

