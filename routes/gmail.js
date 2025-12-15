const express = require('express');
const router = express.Router();
const gmailService = require('../services/gmailService');
const emailController = require('../controllers/emailController');
const { validateUserId, validateEmailOwnership } = require('../middleware/userValidation');

router.get('/list/:userId', validateUserId, async (req, res) => {
  try {
    const { userId } = req.params;
    const messages = await gmailService.listMessagesForUser(userId);
    res.json({ messages });
  } catch (err) {
    const statusCode = err.message?.includes('not found') ? 404 : 
                      err.message?.includes('Unable to decrypt') ? 401 : 500;
    res.status(statusCode).json({ 
      error: err.message,
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

router.get('/fetch/:userId/:messageId', validateEmailOwnership, async (req, res) => {
  try {
    const { userId, messageId } = req.params;
    const message = await gmailService.getMessage(userId, messageId);
    const result = await emailController.classifyAndSuggest(userId, message);
    // Include the message body and snippet in the response for proper display
    res.json({ 
      result,
      message: {
        id: message.id,
        subject: message.subject,
        snippet: message.snippet,
        body: message.body
      }
    });
  } catch (err) {
    const statusCode = err.message?.includes('not found') ? 404 : 
                      err.message?.includes('Permission') ? 403 :
                      err.message?.includes('Unable to decrypt') ? 401 : 500;
    res.status(statusCode).json({ 
      error: err.message,
      details: process.env.NODE_ENV === 'development' ? err.stack : undefined
    });
  }
});

router.post('/reply/:userId/:messageId', validateEmailOwnership, async (req, res) => {
  try {
    const { userId, messageId } = req.params;
    const gmailService = require('../services/gmailService');
    const openaiService = require('../services/openaiService');

    const message = await gmailService.getMessage(userId, messageId);
    const subject = message.subject || '';
    const emailContent = message.body || message.snippet || '';

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

router.post('/send/:userId/:messageId', validateEmailOwnership, async (req, res) => {
  try {
    const { userId, messageId } = req.params;
    const { replyText } = req.body;

    if (!replyText) {
      return res.status(400).json({ error: 'replyText is required in request body' });
    }

    const gmailService = require('../services/gmailService');
    await gmailService.sendReply(userId, messageId, replyText);

    res.json({ success: true, message: 'Reply sent successfully!' });
  } catch (err) {
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
