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
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/userinfo.email',
  'profile'
];

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:4200';

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
    const db = require('../utils/db');
    
    if (state) {
      const user = await db.users.findById(state, true);
      if (user) {
        await db.users.updateTokens(state, tokens);
        const redirectUrl = `${FRONTEND_URL}/inbox?userId=${state}&updated=true`;
        return res.redirect(redirectUrl);
      } else {
        return res.status(404).send('User not found');
      }
    } else {
      const { nanoid } = require('nanoid');
      const id = nanoid();
      
      await db.users.create({
        id,
        tokens,
        createdAt: new Date().toISOString()
      });

      const redirectUrl = `${FRONTEND_URL}/inbox?userId=${id}`;
      return res.redirect(redirectUrl);
    }
  } catch (err) {
    console.error('[OAuth Callback] Error:', err.message);
    res.status(500).json({ 
      error: 'OAuth callback failed',
      message: err.message || 'Unknown error',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
  }
});

router.get('/re-auth/:userId', (req, res) => {
  const { userId } = req.params;
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
    state: userId
  });
  res.json({ url, message: 'Complete OAuth flow to update permissions for existing user' });
});

router.get('/profile/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const gmailService = require('../services/gmailService');
    
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
