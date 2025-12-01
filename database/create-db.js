/**
 * Quick script to create the database and tables
 * Run this if you just want to create the database without migrating data
 * 
 * Usage: node database/create-db.js
 */

require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function createDatabase() {
  console.log('🚀 Creating database and tables...\n');

  // Create connection without database (to create it)
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true
  });

  try {
    const dbName = process.env.DB_NAME || 'email_reply_bot';
    
    // Create database
    await connection.query(`CREATE DATABASE IF NOT EXISTS ${dbName} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log(`✅ Database '${dbName}' created or already exists`);
    
    // Use the database
    await connection.query(`USE ${dbName}`);
    console.log(`✅ Using database '${dbName}'\n`);

    // Read and execute schema
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      const schema = fs.readFileSync(schemaPath, 'utf8');
      
      // Create users table
      await connection.query(`
        CREATE TABLE IF NOT EXISTS users (
          id VARCHAR(21) PRIMARY KEY,
          access_token TEXT NOT NULL,
          refresh_token TEXT,
          token_type VARCHAR(50) DEFAULT 'Bearer',
          scope TEXT,
          id_token TEXT,
          expiry_date BIGINT,
          refresh_token_expires_in INT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          INDEX idx_created_at (created_at),
          INDEX idx_updated_at (updated_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      
      // Create emails table
      await connection.query(`
        CREATE TABLE IF NOT EXISTS emails (
          id VARCHAR(50) PRIMARY KEY,
          user_id VARCHAR(21) NOT NULL,
          subject VARCHAR(500),
          snippet TEXT,
          ai_resp TEXT,
          category VARCHAR(100),
          action TEXT,
          justification TEXT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          INDEX idx_user_id (user_id),
          INDEX idx_created_at (created_at),
          INDEX idx_category (category),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      
      console.log('✅ Tables created successfully\n');
    } else {
      console.error('❌ schema.sql file not found');
      process.exit(1);
    }

    // Verify tables
    const [tables] = await connection.query('SHOW TABLES');
    console.log('📊 Created tables:');
    tables.forEach(table => {
      const tableName = Object.values(table)[0];
      console.log(`   - ${tableName}`);
    });

    console.log('\n🎉 Database setup complete!');
    console.log('\n📝 Next steps:');
    console.log('   1. Update .env file with your Google OAuth and OpenAI credentials');
    console.log('   2. Run: npm run dev');
    console.log('   3. When users login, data will be stored automatically in MySQL\n');

  } catch (error) {
    console.error('❌ Error creating database:', error.message);
    if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('\n💡 Tip: Check your MySQL credentials in .env file');
      console.error('   DB_USER and DB_PASSWORD should match your MySQL setup');
    }
    process.exit(1);
  } finally {
    await connection.end();
  }
}

// Run
createDatabase().catch(error => {
  console.error('❌ Fatal error:', error);
  process.exit(1);
});

