# Email Understanding & Action Bot - Backend (Node.js)

## Overview
This backend provides:
- Google OAuth2 login (server-side) to get Gmail access tokens.
- Fetching email metadata and bodies from Gmail.
- Sending email content to OpenAI to classify intent and suggest actions.
- MySQL database with encrypted OAuth token storage.

## What's included
- `server.js` - app entrypoint
- `routes/auth.js` - OAuth routes (login, callback)
- `routes/gmail.js` - Gmail-related routes (list/fetch emails)
- `controllers/emailController.js` - orchestrates classification + action suggestion
- `services/gmailService.js` - wrappers around googleapis Gmail calls
- `services/openaiService.js` - wrapper to call OpenAI
- `utils/db.js` - MySQL database utilities with connection pooling
- `utils/encryption.js` - AES-256-GCM encryption for OAuth tokens
- `database/schema.sql` - MySQL database schema

## Prerequisites
- Node.js (v14 or higher)
- MySQL (v5.7 or higher, or MariaDB 10.3+)
- Google OAuth2 credentials (Client ID & Secret)
- OpenAI API key

## Setup Instructions

### 1. Install Dependencies
```bash
npm install
```

### 2. Database Setup

#### Option A: Create Database Manually
```bash
# Login to MySQL
mysql -u root -p

# Run the schema file
mysql -u root -p < database/schema.sql
```

#### Option B: Let Migration Script Create It
The migration script will create the database automatically if it doesn't exist.

### 3. Environment Configuration

Create a `.env` file in the root directory:

```env
# Server Configuration
PORT=3000
BASE_URL=http://localhost:3000
NODE_ENV=development

# Google OAuth2
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
REDIRECT_PATH=/auth/google/callback

# OpenAI
OPENAI_API_KEY=your_openai_api_key

# MySQL Database
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=email_reply_bot

# Encryption Key (IMPORTANT: Generate a secure random key for production!)
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=your_32_byte_hex_encryption_key
```

**⚠️ Security Note:** 
- Generate a secure `ENCRYPTION_KEY` for production: 
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- Never commit `.env` file to version control
- Use different encryption keys for different environments

### 4. Start the Server

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm start
```

### 5. Test the Application

Visit: `http://localhost:3000/auth/login` to start Google OAuth flow.

## Database Schema

### Users Table
- Stores OAuth tokens (encrypted)
- Fields: `id`, `access_token` (encrypted), `refresh_token` (encrypted), `token_type`, `scope`, `id_token` (encrypted), `expiry_date`, `created_at`, `updated_at`

### Emails Table
- Stores email classification data
- Fields: `id`, `user_id`, `subject`, `snippet`, `ai_resp`, `category`, `action`, `justification`, `created_at`
- Foreign key relationship with `users` table

## Security Features

✅ **OAuth Token Encryption**: All sensitive tokens are encrypted using AES-256-GCM before storage  
✅ **Connection Pooling**: Efficient database connection management  
✅ **Prepared Statements**: SQL injection protection  
✅ **Environment-based Configuration**: Sensitive data in environment variables  
✅ **Multi-User Isolation**: Strict user validation ensures users can only access their own data  
✅ **Middleware Validation**: All routes validate user existence before processing  
✅ **Gmail API Security**: Uses user's own OAuth tokens (Gmail API enforces ownership)  

## API Endpoints

- `GET /auth/login` - Get Google OAuth login URL
- `GET /auth/google/callback` - OAuth callback handler
- `GET /auth/re-auth/:userId` - Re-authenticate existing user
- `GET /auth/profile/:userId` - Get user profile
- `GET /gmail/list/:userId` - List user's emails
- `GET /gmail/fetch/:userId/:messageId` - Fetch and classify email
- `POST /gmail/reply/:userId/:messageId` - Generate AI reply draft
- `POST /gmail/send/:userId/:messageId` - Send email reply

## Next Steps & Enhancements

1. ✅ Secure refresh token storage (encrypted in MySQL)
2. Frontend integration: implement Angular OAuth flow
3. Implement webhook handlers (n8n) to push classification results
4. Add unit tests, logging, and rate-limiters
5. Harden CORS and add role-based access control
6. Add database backup/restore procedures
7. Implement connection retry logic
8. Add database migration versioning system

