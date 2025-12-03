const express = require('express');
const { google } = require('googleapis');
const router = express.Router();
const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  (process.env.BASE_URL || 'http://localhost:3000') + (process.env.REDIRECT_PATH || '/auth/google/callback')
);

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.send',   // ✅ Needed for send
  'https://www.googleapis.com/auth/userinfo.email',
  'profile'
];

// Frontend URL from environment variable, fallback to localhost for development
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:4200';
console.log('FRONTEND_URL configured as:', FRONTEND_URL);

router.get('/login', (req, res) => {
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent'
  });
  res.json({ url });
});

router.get('/google/callback', async (req, res) => {
  const code = req.query.code;
  const state = req.query.state; // userId passed via state parameter
  if (!code) return res.status(400).send('Missing code');
  
  try {
    console.log('[OAuth Callback] Starting callback processing...');
    console.log('[OAuth Callback] Code received:', code ? 'Yes' : 'No');
    console.log('[OAuth Callback] State:', state || 'None (new user)');
    
    console.log('[OAuth Callback] Step 1: Exchanging code for tokens...');
    const { tokens } = await oauth2Client.getToken(code);
    console.log('[OAuth Callback] Step 1: Success - Tokens received');
    console.log('[OAuth Callback] Token keys:', Object.keys(tokens));
    
    // tokens will contain access_token and refresh_token (on first consent)
    // Tokens are now stored securely (encrypted) in MySQL database
    console.log('[OAuth Callback] Step 2: Loading database module...');
    const db = require('../utils/db');
    console.log('[OAuth Callback] Step 2: Database module loaded');
    
    if (state) {
      // Update existing user's tokens (userId passed in state)
      console.log('[OAuth Callback] Step 3: Updating existing user tokens for userId:', state);
      const user = await db.users.findById(state, true);
      if (user) {
        console.log('[OAuth Callback] Step 3a: User found, updating tokens...');
        await db.users.updateTokens(state, tokens);
        console.log('[OAuth Callback] Step 3a: Tokens updated successfully');
        const redirectUrl = `${FRONTEND_URL}/inbox?userId=${state}&updated=true`;
        console.log('[OAuth Callback] Redirecting to:', redirectUrl);
        return res.redirect(redirectUrl);
      } else {
        console.error('[OAuth Callback] Step 3a: User not found with userId:', state);
        return res.status(404).send('User not found');
      }
    } else {
      // Create new user
      console.log('[OAuth Callback] Step 3: Creating new user...');
      const { nanoid } = require('nanoid');
      const id = nanoid();
      console.log('[OAuth Callback] Step 3a: Generated user ID:', id);
      
      console.log('[OAuth Callback] Step 3b: Creating user in database...');
      await db.users.create({
        id,
        tokens,
        createdAt: new Date().toISOString()
      });
      console.log('[OAuth Callback] Step 3b: User created successfully');

      // Use count() instead of findAll() to avoid decryption warnings for old users
      console.log('[OAuth Callback] Step 3c: Getting user count...');
      await db.users.count();
      console.log('[OAuth Callback] Step 3c: User count retrieved');

      // Send a simple page with token reference (frontend should use this id)
      const redirectUrl = `${FRONTEND_URL}/inbox?userId=${id}`;
      console.log('[OAuth Callback] Step 4: Redirecting to:', redirectUrl);
      return res.redirect(redirectUrl);
    }
  } catch (err) {
    // Comprehensive error logging for production debugging
    console.error('========================================');
    console.error('[OAuth Callback] ERROR CAUGHT');
    console.error('========================================');
    console.error('[OAuth Callback] Error Message:', err.message);
    console.error('[OAuth Callback] Error Code:', err.code);
    console.error('[OAuth Callback] Error Name:', err.name);
    
    // Log full stack trace
    console.error('[OAuth Callback] Stack Trace:');
    console.error(err.stack);
    
    // Log additional error details if available
    if (err.response) {
      console.error('[OAuth Callback] Error Response Status:', err.response.status);
      console.error('[OAuth Callback] Error Response Data:', JSON.stringify(err.response.data, null, 2));
    }
    
    if (err.config) {
      console.error('[OAuth Callback] Error Config URL:', err.config.url);
      console.error('[OAuth Callback] Error Config Method:', err.config.method);
    }
    
    // Log environment info that might be relevant
    console.error('[OAuth Callback] Environment Check:');
    console.error('  - BASE_URL:', process.env.BASE_URL || 'NOT SET');
    console.error('  - FRONTEND_URL:', process.env.FRONTEND_URL || 'NOT SET');
    console.error('  - DB_HOST:', process.env.DB_HOST || 'NOT SET');
    console.error('  - DB_NAME:', process.env.DB_NAME || 'NOT SET');
    console.error('  - ENCRYPTION_KEY:', process.env.ENCRYPTION_KEY ? 'SET' : 'NOT SET');
    console.error('========================================');
    
    // Still return error to client, but now we have full logs
    res.status(500).json({ 
      error: 'OAuth callback failed',
      message: err.message || 'Unknown error',
      // Only include details in development
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
  }
});

// Route to get login URL for updating existing user
router.get('/re-auth/:userId', (req, res) => {
  const { userId } = req.params;
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
    state: userId // Pass userId in state to update existing user
  });
  res.json({ url, message: 'Complete OAuth flow to update permissions for existing user' });
});

// Route to get user profile (name and email)
// Note: We don't use validateUserId here because this endpoint is used to check if user exists
router.get('/profile/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const gmailService = require('../services/gmailService');
    
    // Get user profile from Gmail API and Google OAuth2
    const profile = await gmailService.getUserProfile(userId);
    
    res.json({
      name: profile.name || null,
      email: profile.email || null
    });
  } catch (err) {
    const statusCode = err.message?.includes('not found') ? 404 : 
                      err.message?.includes('Authentication') ? 401 : 500;
    res.status(statusCode).json({ 
      error: err.message || 'Failed to get user profile',
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

module.exports = router;
