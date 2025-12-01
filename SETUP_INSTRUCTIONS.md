# Quick Setup Instructions

## Step 1: Create .env File

Create a file named `.env` in the `email-reply bot` folder with the following content:

```env
# Server Configuration
PORT=3000
BASE_URL=http://localhost:3000
NODE_ENV=development

# Google OAuth2 (Update these with your actual credentials)
GOOGLE_CLIENT_ID=your_google_client_id_here
GOOGLE_CLIENT_SECRET=your_google_client_secret_here
REDIRECT_PATH=/auth/google/callback

# OpenAI (Update with your actual API key)
OPENAI_API_KEY=your_openai_api_key_here

# MySQL Database Configuration
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=1234
DB_NAME=email_reply_bot

# Encryption Key (IMPORTANT: Keep this secret! Never commit to version control!)
# Generate a new one with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=6b6000c1d0f534c3607859127a9fe41647a6acb3a696f6eaf7ae4fd82a20aad5
```

**Your MySQL credentials are already set:**
- Host: `localhost`
- User: `root`
- Password: `1234`
- Database: `email_reply_bot` (will be created automatically)

## Step 2: Install Dependencies

```bash
npm install
```

## Step 3: Create Database and Tables

You have two options:

### Option A: Run Migration Script (Recommended - Creates DB + Migrates Data)

```bash
npm run migrate
```

This will:
- Create the database `email_reply_bot` if it doesn't exist
- Create all necessary tables
- Migrate data from `db.json` if it exists

### Option B: Create Database Manually

```bash
# Login to MySQL
mysql -u root -p
# Enter password: 1234

# Run the schema file
mysql -u root -p < database/schema.sql
# Enter password: 1234
```

Or in MySQL command line:
```sql
CREATE DATABASE IF NOT EXISTS email_reply_bot CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE email_reply_bot;
SOURCE database/schema.sql;
```

## Step 4: Verify Database Connection

Test the connection by starting the server:

```bash
npm run dev
```

If you see "Server listening on port 3000" without errors, the database connection is working!

## Step 5: Update Other Credentials

Don't forget to update:
- `GOOGLE_CLIENT_ID` - Your Google OAuth Client ID
- `GOOGLE_CLIENT_SECRET` - Your Google OAuth Client Secret  
- `OPENAI_API_KEY` - Your OpenAI API key

## Troubleshooting

### Error: "Access denied for user 'root'@'localhost'"
- Check your MySQL password is correct (1234)
- Try: `mysql -u root -p` and enter password manually

### Error: "Database doesn't exist"
- Run the migration script: `npm run migrate`
- Or create manually: `CREATE DATABASE email_reply_bot;`

### Error: "ENCRYPTION_KEY not set"
- Make sure `.env` file exists in the `email-reply bot` folder
- Check the file has `ENCRYPTION_KEY=...` line

### Error: "Cannot find module 'mysql2'"
- Run: `npm install`
- Make sure you're in the `email-reply bot` directory

