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
    // In production store tokens securely (encrypted) and associate with user
    const db = require('../utils/db')();
    
    if (state) {
      // Update existing user's tokens (userId passed in state)
      const user = db.get('users').find({ id: state }).value();
      if (user) {
        db.get('users')
          .find({ id: state })
          .assign({ tokens, updatedAt: new Date().toISOString() })
          .write();
        res.redirect(`http://localhost:4200/inbox?userId=${state}&updated=true`);
      } else {
        res.status(404).send('User not found');
      }
    } else {
      // Create new user
      const { nanoid } = require('nanoid');
      const id = nanoid();
      db.get('users').push({
        id,
        tokens,
        createdAt: new Date().toISOString()
      }).write();

      // Send a simple page with token reference (frontend should use this id)
      res.redirect(`http://localhost:4200/inbox?userId=${id}`);
    }
  } catch (err) {
    console.error(err);
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

module.exports = router;
