/**
 * Migration script: Migrate data from db.json (lowdb) to MySQL
 * 
 * Usage: npm run migrate
 * 
 * This script will:
 * 1. Read data from db.json
 * 2. Create database tables if they don't exist
 * 3. Migrate users (with encrypted tokens)
 * 4. Migrate emails
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const { encrypt } = require('../utils/encryption');

async function migrate() {
  console.log('🚀 Starting migration from db.json to MySQL...\n');

  // Check if db.json exists
  const dbJsonPath = path.join(__dirname, '..', 'db.json');
  if (!fs.existsSync(dbJsonPath)) {
    console.error('❌ db.json file not found. Nothing to migrate.');
    process.exit(1);
  }

  // Read db.json
  let dbData;
  try {
    const dbJsonContent = fs.readFileSync(dbJsonPath, 'utf8');
    dbData = JSON.parse(dbJsonContent);
    console.log('✅ Read db.json successfully');
    console.log(`   - Users: ${dbData.users?.length || 0}`);
    console.log(`   - Emails: ${dbData.emails?.length || 0}\n`);
  } catch (error) {
    console.error('❌ Error reading db.json:', error.message);
    process.exit(1);
  }

  // Create database connection
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true
  });

  try {
    // Create database if it doesn't exist
    const dbName = process.env.DB_NAME || 'email_reply_bot';
    await connection.query(`CREATE DATABASE IF NOT EXISTS ${dbName} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await connection.query(`USE ${dbName}`);
    console.log(`✅ Connected to database: ${dbName}\n`);

    // Read and execute schema
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const schema = fs.readFileSync(schemaPath, 'utf8');
      // Remove CREATE DATABASE and USE statements as we're already connected
      const schemaWithoutDb = schema
        .replace(/CREATE DATABASE[^;]+;/gi, '')
        .replace(/USE[^;]+;/gi, '');
      await connection.query(schemaWithoutDb);
      console.log('✅ Database schema created/verified\n');
    } else {
      console.warn('⚠️  schema.sql not found, assuming tables already exist\n');
    }

    // Migrate users
    if (dbData.users && dbData.users.length > 0) {
      console.log('📦 Migrating users...');
      let migratedUsers = 0;
      let skippedUsers = 0;

      for (const user of dbData.users) {
        try {
          // Check if user already exists
          const [existing] = await connection.execute(
            'SELECT id FROM users WHERE id = ?',
            [user.id]
          );

          if (existing.length > 0) {
            console.log(`   ⏭️  User ${user.id} already exists, skipping...`);
            skippedUsers++;
            continue;
          }

          // Encrypt tokens
          const encryptedAccessToken = user.tokens?.access_token 
            ? encrypt(user.tokens.access_token) 
            : null;
          const encryptedRefreshToken = user.tokens?.refresh_token 
            ? encrypt(user.tokens.refresh_token) 
            : null;
          const encryptedIdToken = user.tokens?.id_token 
            ? encrypt(user.tokens.id_token) 
            : null;

          await connection.execute(
            `INSERT INTO users (id, access_token, refresh_token, token_type, scope, id_token, expiry_date, refresh_token_expires_in, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              user.id,
              encryptedAccessToken,
              encryptedRefreshToken,
              user.tokens?.token_type || 'Bearer',
              user.tokens?.scope || null,
              encryptedIdToken,
              user.tokens?.expiry_date || null,
              user.tokens?.refresh_token_expires_in || null,
              user.createdAt || new Date(),
              user.updatedAt || new Date()
            ]
          );

          migratedUsers++;
          console.log(`   ✅ Migrated user: ${user.id}`);
        } catch (error) {
          console.error(`   ❌ Error migrating user ${user.id}:`, error.message);
        }
      }

      console.log(`\n✅ Users migration complete: ${migratedUsers} migrated, ${skippedUsers} skipped\n`);
    } else {
      console.log('ℹ️  No users to migrate\n');
    }

    // Migrate emails
    if (dbData.emails && dbData.emails.length > 0) {
      console.log('📦 Migrating emails...');
      let migratedEmails = 0;
      let skippedEmails = 0;

      for (const email of dbData.emails) {
        try {
          // Check if email already exists
          const [existing] = await connection.execute(
            'SELECT id FROM emails WHERE id = ?',
            [email.id]
          );

          if (existing.length > 0) {
            skippedEmails++;
            continue;
          }

          // Try to parse AI response to extract category, action, justification
          let category = null;
          let action = null;
          let justification = null;

          if (email.aiResp) {
            try {
              let cleanText = email.aiResp;
              if (typeof cleanText === "string") {
                cleanText = cleanText.replace(/```json|```/g, "").trim();
              }
              const parsed = JSON.parse(cleanText);
              category = parsed.category || null;
              action = parsed.action || null;
              justification = parsed.justification || null;
            } catch (e) {
              // If parsing fails, keep as null
            }
          }

          // Also check if category/action/justification are already in the email object
          if (email.category) category = email.category;
          if (email.action) action = email.action;
          if (email.justification) justification = email.justification;

          await connection.execute(
            `INSERT INTO emails (id, user_id, subject, snippet, ai_resp, category, action, justification, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              email.id,
              email.userId,
              email.subject || null,
              email.snippet || null,
              email.aiResp || null,
              category,
              action,
              justification,
              email.createdAt || new Date()
            ]
          );

          migratedEmails++;
          if (migratedEmails % 50 === 0) {
            console.log(`   ✅ Migrated ${migratedEmails} emails...`);
          }
        } catch (error) {
          console.error(`   ❌ Error migrating email ${email.id}:`, error.message);
        }
      }

      console.log(`\n✅ Emails migration complete: ${migratedEmails} migrated, ${skippedEmails} skipped\n`);
    } else {
      console.log('ℹ️  No emails to migrate\n');
    }

    console.log('🎉 Migration completed successfully!');
    console.log('\n📝 Next steps:');
    console.log('   1. Verify the data in MySQL');
    console.log('   2. Test the application');
    console.log('   3. Once confirmed, you can backup and remove db.json');
    console.log('   4. Make sure ENCRYPTION_KEY is set in your .env file for production\n');

  } catch (error) {
    console.error('❌ Migration error:', error);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

// Run migration
migrate().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

