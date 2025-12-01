const express = require('express');
const router = express.Router();
const gmailService = require('../services/gmailService');
const emailController = require('../controllers/emailController');
const { validateUserId, validateEmailOwnership } = require('../middleware/userValidation');

// list recent messages for a stored user id
router.get('/list/:userId', validateUserId, async (req, res) => {
  try {
    const { userId } = req.params;
    const messages = await gmailService.listMessagesForUser(userId);
    res.json({ messages });
  } catch (err) {
    // Suppress logging for expected decryption errors (user needs to re-authenticate)
    const isDecryptionError = err.message?.includes('Unable to decrypt tokens') || 
                              err.message?.includes('encryption key may have changed');
    if (!isDecryptionError) {
      console.error('Error in /list/:userId:', err);
    }
    const statusCode = err.message?.includes('not found') ? 404 : 
                      err.message?.includes('Unable to decrypt') ? 401 : 500;
    res.status(statusCode).json({ 
      error: err.message,
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

// fetch a single message and classify
router.get('/fetch/:userId/:messageId', validateEmailOwnership, async (req, res) => {
  try {
    const { userId, messageId } = req.params;
    const message = await gmailService.getMessage(userId, messageId);
    const result = await emailController.classifyAndSuggest(userId, message);
    res.json({ result });
  } catch (err) {
    // Suppress logging for expected decryption errors (user needs to re-authenticate)
    const isDecryptionError = err.message?.includes('Unable to decrypt tokens') || 
                              err.message?.includes('encryption key may have changed');
    if (!isDecryptionError) {
      console.error('Error in /fetch/:userId/:messageId:', err);
    }
    const statusCode = err.message?.includes('not found') ? 404 : 
                      err.message?.includes('Permission') ? 403 :
                      err.message?.includes('Unable to decrypt') ? 401 : 500;
    res.status(statusCode).json({ 
      error: err.message,
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});
// ---- AI Auto Reply Draft ----
router.post('/reply/:userId/:messageId', validateEmailOwnership, async (req, res) => {
  try {
    const { userId, messageId } = req.params;
    const gmailService = require('../services/gmailService');
    const openaiService = require('../services/openaiService');

    // Fetch the original email message
    const message = await gmailService.getMessage(userId, messageId);
    const subject = message.subject || '';
    // Use full body if available, otherwise fall back to snippet
    const emailContent = message.body || message.snippet || '';

    // Build AI prompt
    const prompt = `
You are an AI email assistant. Read the email below and draft a short, polite professional reply.

Email Subject: ${subject}
Email Content: ${emailContent}

Reply should be concise, professional, and contextually appropriate.
Output only the email reply text.`;

    const aiReply = await openaiService.classify(prompt);

    res.json({
      success: true,
      replyDraft: aiReply.trim(),
      subject,
      messageId
    });
  } catch (err) {
    // Suppress logging for expected decryption errors (user needs to re-authenticate)
    const isDecryptionError = err.message?.includes('Unable to decrypt tokens') || 
                              err.message?.includes('encryption key may have changed');
    if (!isDecryptionError) {
      console.error('Auto-reply generation error:', err);
    }
    const statusCode = err.message?.includes('not found') ? 404 : 
                      err.message?.includes('Permission') ? 403 :
                      err.message?.includes('required') ? 400 :
                      err.message?.includes('Unable to decrypt') ? 401 : 500;
    res.status(statusCode).json({ 
      error: err.message || 'Failed to generate AI reply.',
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

// ---- Send Reply ----
router.post('/send/:userId/:messageId', validateEmailOwnership, async (req, res) => {
  console.log('🔵 [DEBUG] Send Reply API called');
  console.log('🔵 [DEBUG] Params:', { userId: req.params.userId, messageId: req.params.messageId });
  console.log('🔵 [DEBUG] Body:', { replyText: req.body.replyText ? `${req.body.replyText.substring(0, 50)}...` : 'MISSING' });
  
  try {
    const { userId, messageId } = req.params;
    const { replyText } = req.body;

    if (!replyText) {
      console.log('🔴 [DEBUG] Error: replyText is missing');
      return res.status(400).json({ error: 'replyText is required in request body' });
    }

    console.log('🔵 [DEBUG] Calling gmailService.sendReply...');
    const gmailService = require('../services/gmailService');
    await gmailService.sendReply(userId, messageId, replyText);

    console.log('✅ [DEBUG] Reply sent successfully');
    res.json({ success: true, message: 'Reply sent successfully!' });
  } catch (err) {
    console.error('🔴 [DEBUG] Send reply error caught in route handler');
    console.error('🔴 [DEBUG] Error type:', err.constructor.name);
    console.error('🔴 [DEBUG] Error message:', err.message);
    console.error('🔴 [DEBUG] Error code:', err.code || err.response?.status);
    console.error('🔴 [DEBUG] Error response data:', err.response?.data);
    console.error('🔴 [DEBUG] Full error:', err);
    
    // Suppress logging for expected decryption errors (user needs to re-authenticate)
    const isDecryptionError = err.message?.includes('Unable to decrypt tokens') || 
                              err.message?.includes('encryption key may have changed');
    if (!isDecryptionError) {
      console.error('Send reply error:', err);
    }
    const statusCode = err.message?.includes('not found') ? 404 : 
                      err.message?.includes('Permission') ? 403 :
                      err.message?.includes('required') ? 400 :
                      err.message?.includes('Unable to decrypt') ? 401 : 500;
    res.status(statusCode).json({ 
      error: err.message || 'Failed to send reply.',
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});


module.exports = router;
