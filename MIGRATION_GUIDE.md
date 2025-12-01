# Migration Guide: db.json to MySQL

This guide will help you migrate from the old `db.json` (lowdb) setup to the new MySQL database.

## Why Migrate?

✅ **Security**: OAuth tokens are now encrypted using AES-256-GCM  
✅ **Scalability**: Better performance with large datasets  
✅ **Production Ready**: ACID transactions, proper indexing, connection pooling  
✅ **Multi-user Support**: Better isolation and security  

## Step-by-Step Migration

### 1. Install MySQL

If you don't have MySQL installed:

**Windows:**
- Download from: https://dev.mysql.com/downloads/installer/
- Or use: `choco install mysql` (if you have Chocolatey)

**macOS:**
```bash
brew install mysql
brew services start mysql
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get update
sudo apt-get install mysql-server
sudo systemctl start mysql
```

### 2. Install Dependencies

```bash
npm install
```

This will install `mysql2` package required for MySQL connectivity.

### 3. Configure Environment Variables

Create a `.env` file (or update existing one) with MySQL credentials:

```env
# MySQL Database
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=email_reply_bot

# Encryption Key (IMPORTANT!)
# Generate a secure key:
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ENCRYPTION_KEY=your_generated_32_byte_hex_key_here
```

**⚠️ Important**: Generate a secure encryption key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output and use it as your `ENCRYPTION_KEY`. **Never share this key or commit it to version control!**

### 4. Run Migration Script

The migration script will:
- Create the database if it doesn't exist
- Create tables based on `database/schema.sql`
- Migrate all users (with encrypted tokens)
- Migrate all emails

```bash
npm run migrate
```

**Expected Output:**
```
🚀 Starting migration from db.json to MySQL...
✅ Read db.json successfully
   - Users: 4
   - Emails: 612
✅ Connected to database: email_reply_bot
✅ Database schema created/verified
📦 Migrating users...
   ✅ Migrated user: qIvL4hgiw4JtN26p0cQQI
   ...
✅ Users migration complete: 4 migrated, 0 skipped
📦 Migrating emails...
   ✅ Migrated 50 emails...
   ...
✅ Emails migration complete: 612 migrated, 0 skipped
🎉 Migration completed successfully!
```

### 5. Verify Migration

Check your MySQL database:

```bash
mysql -u root -p email_reply_bot
```

```sql
-- Check users
SELECT id, created_at, updated_at FROM users;

-- Check emails count
SELECT COUNT(*) as total_emails FROM emails;

-- Check emails by user
SELECT user_id, COUNT(*) as email_count FROM emails GROUP BY user_id;
```

### 6. Test the Application

Start the server:

```bash
npm run dev
```

Test the endpoints:
- `GET http://localhost:3000/auth/login` - Should return OAuth URL
- Try logging in with an existing user ID
- Verify that emails are being fetched and classified

### 7. Backup and Cleanup (Optional)

Once you've verified everything works:

1. **Backup db.json** (just in case):
   ```bash
   cp db.json db.json.backup
   ```

2. **Test thoroughly** with the MySQL setup

3. **Remove db.json** (only after confirming everything works):
   ```bash
   # Optional: Keep backup for a while
   mv db.json db.json.old
   ```

## Troubleshooting

### Error: "Access denied for user"
- Check your MySQL credentials in `.env`
- Verify MySQL is running: `mysql -u root -p`
- Create user if needed: `CREATE USER 'your_user'@'localhost' IDENTIFIED BY 'password';`

### Error: "Database doesn't exist"
- The migration script should create it automatically
- Or create manually: `CREATE DATABASE email_reply_bot;`

### Error: "ENCRYPTION_KEY not set"
- Generate a key: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- Add to `.env` file

### Tokens not working after migration
- Verify encryption key is correct
- Check that tokens were encrypted properly
- Re-authenticate users if needed: `GET /auth/re-auth/:userId`

### Migration script fails partway through
- The script is idempotent - you can run it multiple times
- It will skip existing records
- Check MySQL error logs for specific issues

## Rollback (if needed)

If you need to rollback to db.json:

1. The old `lowdb` code is no longer in the codebase
2. You would need to:
   - Restore from git history, OR
   - Export data from MySQL back to JSON format

**Note**: We recommend keeping `db.json.backup` until you're confident the migration is successful.

## What Changed?

### Code Changes
- `utils/db.js` - Now uses MySQL instead of lowdb
- `utils/encryption.js` - New encryption utility for tokens
- `routes/auth.js` - Updated to use async MySQL calls
- `services/gmailService.js` - Updated to use async MySQL calls
- `controllers/emailController.js` - Updated to use async MySQL calls

### Database Structure
- **Users table**: Stores encrypted OAuth tokens
- **Emails table**: Stores email classification data
- **Indexes**: Added for performance (user_id, created_at, category)
- **Foreign keys**: Email table references users table

### Security Improvements
- All OAuth tokens are encrypted at rest
- Encryption uses AES-256-GCM (industry standard)
- Connection pooling for efficient database access
- Prepared statements prevent SQL injection

## Support

If you encounter issues:
1. Check the error logs
2. Verify MySQL is running and accessible
3. Check environment variables are set correctly
4. Review the migration script output for specific errors

