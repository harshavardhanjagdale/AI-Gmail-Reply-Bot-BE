const mysql = require('mysql2/promise');
const { encrypt, decrypt, encryptObject, decryptObject } = require('./encryption');

// Database connection pool
let pool = null;

/**
 * Safe decrypt helper - returns null if decryption fails instead of throwing
 * @param {string} encryptedText - Encrypted string to decrypt
 * @param {boolean} silent - If true, don't log warnings (default: false)
 * @returns {string|null} - Decrypted text or null if decryption fails
 */
function safeDecrypt(encryptedText, silent = false) {
  if (!encryptedText) return null;
  try {
    // Pass silent parameter to decrypt to suppress error logging
    return decrypt(encryptedText, silent);
  } catch (error) {
    return null;
  }
}

/**
 * Initialize MySQL connection pool
 */
function initPool() {
  if (pool) return pool;
  
  pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'email_reply_bot',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
  });
  
  return pool;
}

/**
 * Get database connection pool
 */
function getPool() {
  if (!pool) {
    initPool();
  }
  return pool;
}

/**
 * Users operations
 */
const users = {
  /**
   * Create a new user with encrypted tokens
   */
  async create(userData) {
    const pool = getPool();
    const { id, tokens, createdAt } = userData;
    
    // Encrypt sensitive token fields
    const encryptedTokens = encryptObject(tokens);
    
    const query = `
      INSERT INTO users (id, access_token, refresh_token, token_type, scope, id_token, expiry_date, refresh_token_expires_in, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    await pool.execute(query, [
      id,
      encryptedTokens.access_token,
      encryptedTokens.refresh_token,
      tokens.token_type || 'Bearer',
      tokens.scope || null,
      encryptedTokens.id_token,
      tokens.expiry_date || null,
      tokens.refresh_token_expires_in || null,
      createdAt ? new Date(createdAt) : new Date()
    ]);
    
    return { id, tokens, createdAt };
  },
  
  /**
   * Check if user exists (lightweight check without decryption)
   */
  async exists(userId) {
    const pool = getPool();
    const [rows] = await pool.execute('SELECT id FROM users WHERE id = ? LIMIT 1', [userId]);
    return rows.length > 0;
  },
  
  /**
   * Find user by ID
   * @param {string} userId - User ID to find
   * @param {boolean} silent - If true, suppress decryption warnings (default: false)
   */
  async findById(userId, silent = false) {
    const pool = getPool();
    const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [userId]);
    
    if (rows.length === 0) return null;
    
    const user = rows[0];
    
    // Decrypt tokens (safely handle decryption errors, use silent mode if requested)
    const decryptedTokens = {
      access_token: safeDecrypt(user.access_token, silent),
      refresh_token: safeDecrypt(user.refresh_token, silent),
      token_type: user.token_type,
      scope: user.scope,
      id_token: safeDecrypt(user.id_token, silent),
      expiry_date: user.expiry_date,
      refresh_token_expires_in: user.refresh_token_expires_in
    };
    
    return {
      id: user.id,
      tokens: decryptedTokens,
      createdAt: user.created_at,
      updatedAt: user.updated_at
    };
  },
  
  /**
   * Update user tokens
   */
  async updateTokens(userId, tokens) {
    const pool = getPool();
    const encryptedTokens = encryptObject(tokens);
    
    const query = `
      UPDATE users 
      SET access_token = ?, 
          refresh_token = ?, 
          token_type = ?, 
          scope = ?, 
          id_token = ?, 
          expiry_date = ?, 
          refresh_token_expires_in = ?,
          updated_at = NOW()
      WHERE id = ?
    `;
    
    await pool.execute(query, [
      encryptedTokens.access_token,
      encryptedTokens.refresh_token,
      tokens.token_type || 'Bearer',
      tokens.scope || null,
      encryptedTokens.id_token,
      tokens.expiry_date || null,
      tokens.refresh_token_expires_in || null,
      userId
    ]);
    
    return { id: userId, tokens };
  },
  
  /**
   * Get count of users (faster and no decryption needed)
   */
  async count() {
    const pool = getPool();
    const [rows] = await pool.execute('SELECT COUNT(*) as count FROM users');
    return rows[0].count;
  },
  
  /**
   * Get all users (for migration/debugging)
   * Uses silent decryption to avoid cluttering logs with expected decryption failures
   */
  async findAll() {
    const pool = getPool();
    const [rows] = await pool.execute('SELECT * FROM users ORDER BY created_at DESC');
    
    return rows.map(user => {
      // Use silent mode to avoid warnings for old users with corrupted tokens
      const decryptedTokens = {
        access_token: safeDecrypt(user.access_token, true),
        refresh_token: safeDecrypt(user.refresh_token, true),
        token_type: user.token_type,
        scope: user.scope,
        id_token: safeDecrypt(user.id_token, true),
        expiry_date: user.expiry_date,
        refresh_token_expires_in: user.refresh_token_expires_in
      };
      
      return {
        id: user.id,
        tokens: decryptedTokens,
        createdAt: user.created_at,
        updatedAt: user.updated_at
      };
    });
  },
  
  /**
   * Get most recent user (for auto-resolution)
   */
  async findMostRecent() {
    const pool = getPool();
    const [rows] = await pool.execute('SELECT * FROM users ORDER BY updated_at DESC, created_at DESC LIMIT 1');
    
    if (rows.length === 0) return null;
    
    const user = rows[0];
    const decryptedTokens = {
      access_token: safeDecrypt(user.access_token),
      refresh_token: safeDecrypt(user.refresh_token),
      token_type: user.token_type,
      scope: user.scope,
      id_token: safeDecrypt(user.id_token),
      expiry_date: user.expiry_date,
      refresh_token_expires_in: user.refresh_token_expires_in
    };
    
    return {
      id: user.id,
      tokens: decryptedTokens,
      createdAt: user.created_at,
      updatedAt: user.updated_at
    };
  }
};

/**
 * Emails operations
 */
const emails = {
  /**
   * Create a new email record
   */
  async create(emailData) {
    const pool = getPool();
    const { id, userId, subject, snippet, aiResp, createdAt } = emailData;
    
    // Try to parse AI response to extract category, action, justification
    let category = null;
    let action = null;
    let justification = null;
    
    try {
      let cleanText = aiResp;
      if (typeof cleanText === "string") {
        cleanText = cleanText.replace(/```json|```/g, "").trim();
      }
      const parsed = JSON.parse(cleanText);
      category = parsed.category || null;
      action = parsed.action || null;
      justification = parsed.justification || null;
    } catch (e) {
      // If parsing fails, keep category/action/justification as null
    }
    
    const query = `
      INSERT INTO emails (id, user_id, subject, snippet, ai_resp, category, action, justification, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    await pool.execute(query, [
      id,
      userId,
      subject,
      snippet,
      aiResp,
      category,
      action,
      justification,
      createdAt ? new Date(createdAt) : new Date()
    ]);
    
    return { id, userId, subject, snippet, aiResp, category, action, justification, createdAt };
  },
  
  /**
   * Find emails by user ID
   */
  async findByUserId(userId, limit = 50) {
    const pool = getPool();
    // MySQL LIMIT doesn't accept parameters directly, so we use template literal
    // But we validate limit is a number to prevent SQL injection
    const safeLimit = parseInt(limit, 10) || 50;
    const [rows] = await pool.execute(
      `SELECT * FROM emails WHERE user_id = ? ORDER BY created_at DESC LIMIT ${safeLimit}`,
      [userId]
    );
    
    return rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      subject: row.subject,
      snippet: row.snippet,
      aiResp: row.ai_resp,
      category: row.category,
      action: row.action,
      justification: row.justification,
      createdAt: row.created_at
    }));
  },
  
  /**
   * Find email by ID (with optional userId validation for security)
   */
  async findById(emailId, userId = null) {
    const pool = getPool();
    let query = 'SELECT * FROM emails WHERE id = ?';
    const params = [emailId];
    
    // If userId is provided, ensure the email belongs to that user (security check)
    if (userId) {
      query += ' AND user_id = ?';
      params.push(userId);
    }
    
    const [rows] = await pool.execute(query, params);
    
    if (rows.length === 0) return null;
    
    const row = rows[0];
    return {
      id: row.id,
      userId: row.user_id,
      subject: row.subject,
      snippet: row.snippet,
      aiResp: row.ai_resp,
      category: row.category,
      action: row.action,
      justification: row.justification,
      createdAt: row.created_at
    };
  }
};

// Initialize pool on module load
initPool();

module.exports = {
  getPool,
  initPool,
  users,
  emails
};
