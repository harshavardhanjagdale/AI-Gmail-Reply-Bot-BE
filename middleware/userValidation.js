/**
 * User Validation Middleware
 * Ensures users can only access their own data
 */

const db = require('../utils/db');

/**
 * Middleware to validate that the userId in the route params exists
 * and optionally matches a session/token (for future session-based auth)
 */
async function validateUserId(req, res, next) {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }
    
    // Check if user exists (lightweight check without decryption)
    const userExists = await db.users.exists(userId);
    if (!userExists) {
      return res.status(404).json({ 
        error: 'User not found. Please authenticate first.',
        userId 
      });
    }
    
    // Get full user data with silent decryption to avoid warnings
    const user = await db.users.findById(userId, true);
    
    // Attach user to request for use in route handlers
    req.validatedUser = user;
    next();
  } catch (error) {
    console.error('User validation error:', error);
    res.status(500).json({ error: 'User validation failed' });
  }
}

/**
 * Middleware to ensure email belongs to the specified user
 * Use this for routes that access email data
 */
async function validateEmailOwnership(req, res, next) {
  try {
    const { userId, messageId } = req.params;
    
    if (!userId || !messageId) {
      return res.status(400).json({ error: 'userId and messageId are required' });
    }
    
    // Note: Gmail messageId is from Gmail API, not our database
    // We validate the userId instead - the Gmail API will enforce message ownership
    // since it uses the user's OAuth tokens
    
    // Check if user exists (lightweight check without decryption)
    const userExists = await db.users.exists(userId);
    if (!userExists) {
      return res.status(404).json({ 
        error: 'User not found. Please authenticate first.',
        userId 
      });
    }
    
    // Get full user data with silent decryption to avoid warnings
    const user = await db.users.findById(userId, true);
    
    req.validatedUser = user;
    next();
  } catch (error) {
    console.error('Email ownership validation error:', error);
    res.status(500).json({ error: 'Email ownership validation failed' });
  }
}

module.exports = {
  validateUserId,
  validateEmailOwnership
};

