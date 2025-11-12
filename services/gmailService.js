const { google } = require('googleapis');
const db = require('../utils/db')();

function getUserTokens(userId) {
  // Always read fresh data from disk to get latest users
  db.read();
  const user = db.get('users').find({ id: userId }).value();
  if (!user) throw new Error(`User not found with id: ${userId}`);
  if (!user.tokens) throw new Error(`No tokens found for user: ${userId}`);
  return user.tokens;
}

function getAuthenticatedClient(userId) {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in environment variables');
  }

  const tokens = getUserTokens(userId);
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  
  oauth2Client.setCredentials(tokens);
  
  // Handle token refresh automatically
  oauth2Client.on('tokens', (newTokens) => {
    try {
      // Get fresh database instance to avoid stale data
      const freshDb = require('../utils/db')();
      
      // Update tokens object
      if (newTokens.refresh_token) {
        tokens.refresh_token = newTokens.refresh_token;
      }
      Object.assign(tokens, newTokens);
      
      // Save updated tokens back to database
      freshDb.get('users')
        .find({ id: userId })
        .assign({ tokens })
        .write();
      
      console.log(`✅ Tokens refreshed for user: ${userId}`);
    } catch (error) {
      console.error('Error saving refreshed tokens:', error);
      // Don't throw - token refresh succeeded even if save failed
    }
  });

  return oauth2Client;
}

async function listMessagesForUser(userId) {
  try {
    const oauth2Client = getAuthenticatedClient(userId);
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Step 1: get basic list
    const resp = await gmail.users.messages.list({ userId: 'me', maxResults: 15 });
    const messages = resp.data.messages || [];

    if (!messages || messages.length === 0) {
      return [];
    }

    // Step 2: fetch metadata for each message (subject, from, snippet, date)
    const detailedMessages = await Promise.all(
      messages.map(async (msg) => {
        try {
          const full = await gmail.users.messages.get({
            userId: 'me',
            id: msg.id,
            format: 'metadata',
            metadataHeaders: ['Subject', 'From', 'Date']
          });

          const headers = full.data.payload?.headers || [];
          const subject = headers.find(h => h.name === 'Subject')?.value || '(no subject)';
          const from = headers.find(h => h.name === 'From')?.value || '(unknown)';
          const date = headers.find(h => h.name === 'Date')?.value || '';
          const snippet = full.data.snippet || '';

          return {
            id: msg.id,
            threadId: msg.threadId,
            subject,
            from,
            date,
            snippet
          };
        } catch (err) {
          console.error(`Error fetching message ${msg.id}:`, err.message);
          // Return a basic message object even if details fail
          return {
            id: msg.id,
            threadId: msg.threadId,
            subject: '(error loading)',
            from: '(error loading)',
            date: '',
            snippet: ''
          };
        }
      })
    );

    return detailedMessages;
  } catch (err) {
    // Enhance error messages for common Gmail API errors
    if (err.code === 401 || err.message?.includes('Invalid Credentials')) {
      throw new Error('Authentication failed. Please re-authenticate your Google account.');
    } else if (err.code === 403) {
      throw new Error('Permission denied. Please check Gmail API permissions.');
    } else if (err.code === 429) {
      throw new Error('Rate limit exceeded. Please try again later.');
    }
    throw err;
  }
}

async function sendReply(userId, messageId, replyText) {
  try {
    if (!replyText || !replyText.trim()) {
      throw new Error('Reply text is required');
    }

    const oauth2Client = getAuthenticatedClient(userId);
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Get user's email address
    const profile = await gmail.users.getProfile({ userId: 'me' });
    const userEmail = profile.data.emailAddress;
    if (!userEmail) {
      throw new Error('Unable to retrieve user email address');
    }

    // Get original message to extract thread info and sender
    const message = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'metadata' });
    const headers = message.data.payload?.headers || [];
    
    if (!headers || headers.length === 0) {
      throw new Error('Unable to retrieve message headers');
    }

    const subject = headers.find(h => h.name === 'Subject')?.value || '';
    const fromHeader = headers.find(h => h.name === 'From')?.value || '';
    const threadId = message.data.threadId;

    if (!fromHeader) {
      throw new Error('Unable to determine recipient email address');
    }

    // Extract email address from "Name <email@example.com>" format
    const fromEmailMatch = fromHeader.match(/<([^>]+)>/) || fromHeader.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
    const fromEmail = fromEmailMatch ? fromEmailMatch[1] : fromHeader;

    // Clean replyText - remove subject line if it's included
    let cleanReplyText = replyText.trim();
    // Remove "Subject: Re: ..." if present at the start
    cleanReplyText = cleanReplyText.replace(/^Subject:\s*Re:.*?\n\n?/i, '');
    // Remove any leading "Re: " from subject-like lines
    cleanReplyText = cleanReplyText.replace(/^Re:\s*/i, '');

    // Prepare RFC 2822 formatted email
    const rawMessage = [
      `From: ${userEmail}`,
      `To: ${fromEmail}`,
      `Subject: Re: ${subject}`,
      `In-Reply-To: ${messageId}`,
      `References: ${messageId}`,
      '',
      cleanReplyText
    ].join('\n');

    const encodedMessage = Buffer.from(rawMessage)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    // Send message in the same thread
    await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
        threadId
      }
    });

    console.log(`✅ Reply sent to ${fromEmail} for thread ${threadId}`);
  } catch (err) {
    // Enhance error messages for common Gmail API errors
    if (err.code === 401 || err.message?.includes('Invalid Credentials')) {
      throw new Error('Authentication failed. Please re-authenticate your Google account.');
    } else if (err.code === 403) {
      if (err.message?.includes('Insufficient Permission') || err.message?.includes('insufficient')) {
        throw new Error('Permission denied. Gmail send permission is required. Please re-authenticate with the correct scopes.');
      }
      throw new Error('Permission denied. Please check Gmail API permissions.');
    } else if (err.code === 429) {
      throw new Error('Rate limit exceeded. Please try again later.');
    } else if (err.code === 400) {
      throw new Error(`Invalid request: ${err.message}`);
    }
    throw err;
  }
}


async function getMessage(userId, messageId) {
  const oauth2Client = getAuthenticatedClient(userId);
  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  const resp = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
  const payload = resp.data.payload || {};
  const headers = payload.headers || [];
  const subjectH = headers.find(h => h.name.toLowerCase() === 'subject');
  const subject = subjectH ? subjectH.value : '';
  const snippet = resp.data.snippet || '';
  return { id: messageId, subject, snippet, raw: resp.data };
}

module.exports = { listMessagesForUser, getMessage, sendReply };
