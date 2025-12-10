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

    // Create connection without database to create it if needed
    const tempConnection = await mysql.createConnection({
      host: dbHost,
      user: dbUser,
      password: dbPassword
    });
    await tempConnection.query(`CREATE DATABASE IF NOT EXISTS ${dbName} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    
    await tempConnection.end();
    
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
    
    await pool.end();
    return true;
  } catch (error) {
    return false;
  }
}

module.exports = { ensureDatabase };

