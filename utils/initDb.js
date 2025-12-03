/**
 * Database initialization utility
 * Ensures database and tables exist before starting the server
 */

const mysql = require('mysql2/promise');

async function ensureDatabase() {
  try {
    const dbHost = process.env.DB_HOST || 'localhost';
    const dbUser = process.env.DB_USER || 'root';
    const dbPassword = process.env.DB_PASSWORD || '';
    const dbName = process.env.DB_NAME || 'email_reply_bot';
    
    console.log('[Database Init] Attempting to connect to database...');
    console.log('[Database Init] Host:', dbHost);
    console.log('[Database Init] User:', dbUser);
    console.log('[Database Init] Database:', dbName);
    
    // Create connection without database to create it if needed
    const tempConnection = await mysql.createConnection({
      host: dbHost,
      user: dbUser,
      password: dbPassword
    });
    
    console.log('[Database Init] Connected successfully');
    
    // Create database if it doesn't exist
    console.log('[Database Init] Ensuring database exists...');
    await tempConnection.query(`CREATE DATABASE IF NOT EXISTS ${dbName} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    console.log('[Database Init] Database ensured');
    
    await tempConnection.end();
    
    // Now create tables
    const pool = mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT,
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: dbName,
      waitForConnections: true,
      connectionLimit: 10
    });
    
    // Create users table
    try {
      await pool.execute(`
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
    } catch (err) {
      if (!err.message.includes('already exists')) {
        throw err;
      }
    }
    
    // Create emails table
    try {
      await pool.execute(`
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
    } catch (err) {
      if (!err.message.includes('already exists')) {
        throw err;
      }
    }
    
    await pool.end();
    console.log('[Database Init] Database initialization completed successfully');
    return true;
  } catch (error) {
    console.error('[Database Init] ❌ Database initialization failed:');
    console.error('[Database Init] Error:', error.message);
    console.error('[Database Init] Error Code:', error.code);
    if (error.code === 'ENOTFOUND') {
      console.error('[Database Init] → Hostname not found. Check DB_HOST environment variable.');
      console.error('[Database Init] → If using Railway database, make sure you\'re using the external hostname, not railway.internal');
    } else if (error.code === 'ECONNREFUSED') {
      console.error('[Database Init] → Connection refused. Check if database is running and accessible.');
    } else if (error.code === 'ER_ACCESS_DENIED_ERROR') {
      console.error('[Database Init] → Access denied. Check DB_USER and DB_PASSWORD.');
    }
    return false;
  }
}

module.exports = { ensureDatabase };

