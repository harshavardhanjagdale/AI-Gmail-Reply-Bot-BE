const { google } = require('googleapis');
const db = require('../utils/db');

async function getUserTokens(userId) {
  // Validate userId is provided
  if (!userId || typeof userId !== 'string') {
    throw new Error('Invalid userId provided');
  }

  // Get user from MySQL database (tokens are automatically decrypted)
  // Use silent mode to suppress decryption warnings - we'll handle errors explicitly
  const user = await db.users.findById(userId, true);
  
  // STRICT VALIDATION: Fail if user not found (no auto-resolution for security)
  // This ensures users can only access their own data
  if (!user) {
    throw new Error(`User not found with id: ${userId}. Please authenticate first.`);
  }
  
  if (!user.tokens) {
    throw new Error(`No tokens found for user: ${user.id}. Please re-authenticate.`);
  }
  
  // Check if tokens are valid (not all null due to decryption failure)
  const tokens = user.tokens;
  if (!tokens.access_token && !tokens.refresh_token) {
    throw new Error(`Unable to decrypt tokens for user: ${user.id}. The encryption key may have changed. Please re-authenticate by visiting /auth/re-auth/${user.id}`);
  }
  
  return { tokens: user.tokens, actualUserId: user.id };
}

async function getAuthenticatedClient(userId) {
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
    throw new Error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in environment variables');
  }

  const { tokens, actualUserId } = await getUserTokens(userId);
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  
  oauth2Client.setCredentials(tokens);
  
  // Handle token refresh automatically
  oauth2Client.on('tokens', async (newTokens) => {
    try {
      // Update tokens object
      const updatedTokens = { ...tokens };
      if (newTokens.refresh_token) {
        updatedTokens.refresh_token = newTokens.refresh_token;
      }
      Object.assign(updatedTokens, newTokens);
      
      // Save updated tokens back to database using the actual user ID
      await db.users.updateTokens(actualUserId, updatedTokens);
    } catch (error) {
      // Don't throw - token refresh succeeded even if save failed
    }
  });

  return oauth2Client;
}

async function listMessagesForUser(userId) {
  try {
    const oauth2Client = await getAuthenticatedClient(userId);
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Step 0: Get user's email address to filter out sent messages
    const profile = await gmail.users.getProfile({ userId: 'me' });
    const userEmail = profile.data.emailAddress?.toLowerCase() || '';
    
    if (!userEmail) {
      throw new Error('Unable to retrieve user email address');
    }

    // Step 1: get basic list - only get Primary tab emails, exclude sent messages
    // Query: category:primary in:inbox -from:me means "Primary tab, in inbox, and not from me"
    // This automatically excludes Promotions, Social, Updates, and Forums tabs
    const resp = await gmail.users.messages.list({ 
      userId: 'me', 
      maxResults: 70, // Fetch enough to get 50 after filtering
      q: 'category:primary in:inbox -from:me' // Only Primary tab inbox messages, exclude messages sent by the user
    });
    const messages = resp.data.messages || [];

    if (!messages || messages.length === 0) {
      return [];
    }

    // Helper function to clean email body text - removes tracking URLs, unsubscribe links, encoded data
    const cleanBodyText = (text) => {
      if (!text) return '';
      
      // Remove ALL URLs (http/https) - they're usually tracking links
      text = text.replace(/https?:\/\/[^\s]+/g, '');
      
      // Remove unsubscribe links and sections (case insensitive, even without URL)
      text = text.replace(/Unsubscribe[:\s]*(https?:\/\/[^\s]+)?/gi, '');
      text = text.replace(/unsubscribe[:\s]*(https?:\/\/[^\s]+)?/gi, '');
      text = text.replace(/Click here to unsubscribe[:\s]*(https?:\/\/[^\s]+)?/gi, '');
      text = text.replace(/See more[:\s]*(https?:\/\/[^\s]+)?/gi, '');
      text = text.replace(/View more[:\s]*(https?:\/\/[^\s]+)?/gi, '');
      
      // Remove common email marketing phrases that are usually followed by tracking
      text = text.replace(/Yes, connect[:\s]*/gi, '');
      text = text.replace(/Connect[:\s]*/gi, '');
      text = text.replace(/More people you may know[:\s]*/gi, '');
      text = text.replace(/See more people[:\s]*/gi, '');
      
      // Remove standalone long encoded strings (tracking IDs, base64-like data)
      text = text.replace(/\b[A-Za-z0-9_-]{30,}\b/g, '');
      
      // Remove email footer patterns (everything after "--" or common footer markers)
      text = text.replace(/--\s*\n.*$/s, '');
      text = text.replace(/^--\s*$/m, '');
      
      // Remove lines that are mostly encoded data or tracking
      text = text.split('\n').filter(line => {
        const trimmed = line.trim();
        // Skip empty lines
        if (!trimmed) return false;
        // Skip lines that are mostly URLs (even if URL was removed, might have fragments)
        if (trimmed.match(/^[A-Za-z0-9_-]{20,}$/)) return false;
        // Skip lines with high ratio of special encoding characters (%, &, =)
        const specialChars = (trimmed.match(/[%&=]/g) || []).length;
        if (specialChars > trimmed.length * 0.3) return false;
        return true;
      }).join('\n');
      
      // Remove multiple consecutive whitespace and newlines
      text = text.replace(/\s+/g, ' ');
      text = text.replace(/\n\s*\n/g, '\n');
      
      // Remove leading/trailing whitespace
      text = text.trim();
      
      return text;
    };

    // Helper function to extract plain text body only (ignores HTML, images, attachments)
    const extractBody = (payload) => {
      let body = '';
      
      // Skip if it's an image or attachment
      if (payload.mimeType && (payload.mimeType.startsWith('image/') || payload.mimeType.startsWith('application/'))) {
        return '';
      }
      
      // If it's a simple text/plain message
      if (payload.mimeType === 'text/plain' && payload.body && payload.body.data) {
        body = Buffer.from(payload.body.data, 'base64').toString('utf-8');
        return cleanBodyText(body);
      }
      
      // For multipart messages, recursively search for text/plain only
      if (payload.parts) {
        for (const part of payload.parts) {
          // Skip images and attachments
          if (part.mimeType && (part.mimeType.startsWith('image/') || 
                                part.mimeType.startsWith('application/') ||
                                part.mimeType.startsWith('video/') ||
                                part.mimeType.startsWith('audio/'))) {
            continue;
          }
          
          // Only extract text/plain, ignore HTML
          if (part.mimeType === 'text/plain' && part.body && part.body.data) {
            const text = Buffer.from(part.body.data, 'base64').toString('utf-8');
            if (text.trim()) {
              body = cleanBodyText(text);
              break; // Prefer plain text, stop searching
            }
          } else if (part.parts) {
            // Recursive for nested multipart messages
            const subBody = extractBody(part);
            if (subBody && !body) {
              body = subBody;
            }
          }
        }
      }
      
      return body;
    };

    // Step 2: fetch full message data (including body) for each message
    const detailedMessages = await Promise.all(
      messages.map(async (msg) => {
        try {
          const full = await gmail.users.messages.get({
            userId: 'me',
            id: msg.id,
            format: 'full' // Changed to 'full' to get body content
          });

          const headers = full.data.payload?.headers || [];
          const subject = headers.find(h => h.name === 'Subject')?.value || '(no subject)';
          const from = headers.find(h => h.name === 'From')?.value || '(unknown)';
          const date = headers.find(h => h.name === 'Date')?.value || '';
          const snippet = full.data.snippet || '';
          
          // Extract full body text
          const body = extractBody(full.data.payload || {});
          
          // Create a longer preview (at least 50 words or full body if shorter)
          const words = body.split(/\s+/).filter(w => w.length > 0);
          const previewLength = Math.max(50, Math.min(words.length, 200)); // At least 50 words, max 200
          const bodyPreview = words.slice(0, previewLength).join(' ') + (words.length > previewLength ? '...' : '');
          
          // Get internal date from Gmail API (more reliable than header date)
          const internalDate = full.data.internalDate ? parseInt(full.data.internalDate) : null;

          // Additional check: extract email from "From" header and verify it's not the user
          const fromEmailMatch = from.match(/<([^>]+)>/) || from.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
          const fromEmail = fromEmailMatch ? fromEmailMatch[1].toLowerCase() : from.toLowerCase();
          
          // Skip if this message is from the user (double-check)
          if (fromEmail === userEmail) {
            return null;
          }

          // Skip no-reply emails (noreply, no-reply, donotreply, no_reply, etc.)
          const noReplyPatterns = [
            /noreply@/i,
            /no-reply@/i,
            /no_reply@/i,
            /donotreply@/i,
            /do-not-reply@/i,
            /do_not_reply@/i,
            /noreply\+/i,
            /no-reply\+/i
          ];
          
          const isNoReply = noReplyPatterns.some(pattern => pattern.test(fromEmail) || pattern.test(from));
          if (isNoReply) {
            return null;
          }

          return {
            id: msg.id,
            threadId: msg.threadId,
            subject,
            from,
            date,
            snippet: bodyPreview || snippet, // Use body preview instead of short snippet
            body: body, // Full body for detailed view
            internalDate // Add internal date for sorting
          };
        } catch (err) {
          return null; // Return null for failed messages, we'll filter them out
        }
      })
    );

    // Filter out null values (failed messages and sent messages)
    const validMessages = detailedMessages.filter(msg => msg !== null);
    
    // Sort by internal date (newest first) - Gmail API should return in order, but we'll ensure it
    validMessages.sort((a, b) => {
      const dateA = a.internalDate || 0;
      const dateB = b.internalDate || 0;
      return dateB - dateA; // Descending order (newest first)
    });
    
    // Limit to 50 most recent messages
    return validMessages.slice(0, 50);
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

    const oauth2Client = await getAuthenticatedClient(userId);
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
  try {
    const oauth2Client = await getAuthenticatedClient(userId);
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const resp = await gmail.users.messages.get({ userId: 'me', id: messageId, format: 'full' });
    const payload = resp.data.payload || {};
    const headers = payload.headers || [];
    const subjectH = headers.find(h => h.name.toLowerCase() === 'subject');
    const subject = subjectH ? subjectH.value : '';
    const snippet = resp.data.snippet || '';
    
    // Helper function to clean email body text - removes tracking URLs, unsubscribe links, encoded data
    const cleanBodyText = (text) => {
      if (!text) return '';
      
      // Remove ALL URLs (http/https) - they're usually tracking links
      text = text.replace(/https?:\/\/[^\s]+/g, '');
      
      // Remove unsubscribe links and sections (case insensitive, even without URL)
      text = text.replace(/Unsubscribe[:\s]*(https?:\/\/[^\s]+)?/gi, '');
      text = text.replace(/unsubscribe[:\s]*(https?:\/\/[^\s]+)?/gi, '');
      text = text.replace(/Click here to unsubscribe[:\s]*(https?:\/\/[^\s]+)?/gi, '');
      text = text.replace(/See more[:\s]*(https?:\/\/[^\s]+)?/gi, '');
      text = text.replace(/View more[:\s]*(https?:\/\/[^\s]+)?/gi, '');
      
      // Remove common email marketing phrases that are usually followed by tracking
      text = text.replace(/Yes, connect[:\s]*/gi, '');
      text = text.replace(/Connect[:\s]*/gi, '');
      text = text.replace(/More people you may know[:\s]*/gi, '');
      text = text.replace(/See more people[:\s]*/gi, '');
      
      // Remove standalone long encoded strings (tracking IDs, base64-like data)
      text = text.replace(/\b[A-Za-z0-9_-]{30,}\b/g, '');
      
      // Remove email footer patterns (everything after "--" or common footer markers)
      text = text.replace(/--\s*\n.*$/s, '');
      text = text.replace(/^--\s*$/m, '');
      
      // Remove lines that are mostly encoded data or tracking
      text = text.split('\n').filter(line => {
        const trimmed = line.trim();
        // Skip empty lines
        if (!trimmed) return false;
        // Skip lines that are mostly URLs (even if URL was removed, might have fragments)
        if (trimmed.match(/^[A-Za-z0-9_-]{20,}$/)) return false;
        // Skip lines with high ratio of special encoding characters (%, &, =)
        const specialChars = (trimmed.match(/[%&=]/g) || []).length;
        if (specialChars > trimmed.length * 0.3) return false;
        return true;
      }).join('\n');
      
      // Remove multiple consecutive whitespace and newlines
      text = text.replace(/\s+/g, ' ');
      text = text.replace(/\n\s*\n/g, '\n');
      
      // Remove leading/trailing whitespace
      text = text.trim();
      
      return text;
    };

    // Extract plain text body only (ignores HTML, images, attachments)
    const extractBody = (payload) => {
      let body = '';
      
      // Skip if it's an image or attachment
      if (payload.mimeType && (payload.mimeType.startsWith('image/') || payload.mimeType.startsWith('application/'))) {
        return '';
      }
      
      // If it's a simple text/plain message
      if (payload.mimeType === 'text/plain' && payload.body && payload.body.data) {
        body = Buffer.from(payload.body.data, 'base64').toString('utf-8');
        return cleanBodyText(body);
      }
      
      // For multipart messages, recursively search for text/plain only
      if (payload.parts) {
        for (const part of payload.parts) {
          // Skip images and attachments
          if (part.mimeType && (part.mimeType.startsWith('image/') || 
                                part.mimeType.startsWith('application/') ||
                                part.mimeType.startsWith('video/') ||
                                part.mimeType.startsWith('audio/'))) {
            continue;
          }
          
          // Only extract text/plain, ignore HTML
          if (part.mimeType === 'text/plain' && part.body && part.body.data) {
            const text = Buffer.from(part.body.data, 'base64').toString('utf-8');
            if (text.trim()) {
              body = cleanBodyText(text);
              break; // Prefer plain text, stop searching
            }
          } else if (part.parts) {
            // Recursive for nested multipart messages
            const subBody = extractBody(part);
            if (subBody && !body) {
              body = subBody;
            }
          }
        }
      }
      
      return body;
    };
    
    const body = extractBody(payload);
    
    return { id: messageId, subject, snippet, body: body || snippet, raw: resp.data };
  } catch (err) {
    // Use the provided userId (no auto-resolution for security)
    const actualUserId = userId;
    
    // Extract error message from GaxiosError structure if available
    const errorMessage = err.response?.data?.error?.message || err.message || 'Unknown error';
    const errorCode = err.code || err.response?.status;
    
    // Enhance error messages for common Gmail API errors
    if (errorCode === 404 || errorMessage.includes('not found') || errorMessage.includes('Requested entity was not found')) {
      throw new Error(`Message not found. The message ID "${messageId}" does not exist or is not accessible in this Gmail account. Use GET /gmail/list/${actualUserId} to get a list of valid message IDs.`);
    } else if (errorCode === 401 || errorMessage.includes('Invalid Credentials')) {
      throw new Error('Authentication failed. Please re-authenticate your Google account.');
    } else if (errorCode === 403) {
      throw new Error('Permission denied. Please check Gmail API permissions.');
    } else if (errorCode === 429) {
      throw new Error('Rate limit exceeded. Please try again later.');
    } else if (errorCode === 400) {
      throw new Error(`Invalid request: ${errorMessage}`);
    }
    throw err;
  }
}

async function getUserProfile(userId) {
  try {
    const oauth2Client = await getAuthenticatedClient(userId);
    
    let name = null;
    let email = null;
    
    // Get user info from Google OAuth2 userinfo endpoint using direct HTTP request
    try {
      const response = await oauth2Client.request({
        url: 'https://www.googleapis.com/oauth2/v2/userinfo'
      });
      
      name = response.data.name || null;
      email = response.data.email || null;
    } catch (oauth2Error) {
    }
    
    // Get email from Gmail profile (as fallback or primary source)
    try {
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
      const gmailProfile = await gmail.users.getProfile({ userId: 'me' });
      if (!email && gmailProfile.data.emailAddress) {
        email = gmailProfile.data.emailAddress;
      }
    } catch (gmailError) {
    }
    
    if (!email) {
      throw new Error('Unable to retrieve user email address from Google APIs');
    }
    
    return {
      name: name,
      email: email
    };
  } catch (err) {
    // Enhance error messages for common errors
    if (err.code === 401 || err.message?.includes('Invalid Credentials')) {
      throw new Error('Authentication failed. Please re-authenticate your Google account.');
    } else if (err.code === 403) {
      throw new Error('Permission denied. Please check Google API permissions.');
    }
    throw err;
  }
}

module.exports = { listMessagesForUser, getMessage, sendReply, getUserProfile };
