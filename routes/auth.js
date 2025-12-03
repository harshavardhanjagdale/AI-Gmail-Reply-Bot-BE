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
    const { tokens } = await oauth2Client.getToken(code);
    // tokens will contain access_token and refresh_token (on first consent)
    // Tokens are now stored securely (encrypted) in MySQL database
    const db = require('../utils/db');
    
    if (state) {
      // Update existing user's tokens (userId passed in state)
      // Use silent mode since we're about to update tokens anyway (old tokens may be corrupted)
      const user = await db.users.findById(state, true);
      if (user) {
        await db.users.updateTokens(state, tokens);
        const redirectUrl = `${FRONTEND_URL}/inbox?userId=${state}&updated=true`;
        console.log('Redirecting to:', redirectUrl);
        return res.redirect(redirectUrl);
      } else {
        res.status(404).send('User not found');
      }
    } else {
      // Create new user
      const { nanoid } = require('nanoid');
      const id = nanoid();
      await db.users.create({
        id,
        tokens,
        createdAt: new Date().toISOString()
      });

      // Use count() instead of findAll() to avoid decryption warnings for old users
      await db.users.count();

      // Send a simple page with token reference (frontend should use this id)
      res.redirect(`${FRONTEND_URL}/inbox?userId=${id}`);
    }
  } catch (err) {
    res.status(500).json({ error: 'OAuth callback failed' });
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
