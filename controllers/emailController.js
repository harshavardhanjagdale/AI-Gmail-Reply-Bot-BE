const openaiService = require('../services/openaiService');
const db = require('../utils/db');

/**
 * classifyAndSuggest - sends email content to OpenAI to classify intent and suggest an action.
 * Returns: { category, action, justification, rawModelResponse }
 */
async function classifyAndSuggest(userId, message) {
  // create a compact prompt with the subject and a trimmed snippet of body
  const subject = message.subject || '';
  const snippet = (message.snippet || '').slice(0, 1000);
  const prompt = `You are an assistant that classifies emails into categories and returns a short suggested action with a one-sentence justification.

Predefined categories: ["Invoice", "Leave Request", "Support Request", "Meeting Request", "Purchase Order", "Spam", "Other"]

Output JSON only with keys: category, action, justification (one sentence).

Email subject: ${subject}
Email snippet: ${snippet}
`;

  const aiResp = await openaiService.classify(prompt);
  // store in MySQL database
  const record = {
    id: Date.now().toString(),
    userId,
    subject,
    snippet,
    aiResp,
    createdAt: new Date().toISOString()
  };
  await db.emails.create(record);

  // try to parse JSON from model (best-effort)
  let parsed = {};
try {
  let cleanText = aiResp;

  // If the model wrapped output in Markdown code fences (```json ... ```)
  if (typeof cleanText === "string") {
    cleanText = cleanText.replace(/```json|```/g, "").trim();
  }

  parsed = JSON.parse(cleanText);
} catch (e) {
  parsed = { 
    category: "Other", 
    action: "Review manually", 
    justification: "Could not parse model output." 
  };
} 

  return { ...parsed, rawModelResponse: aiResp };
}

module.exports = { classifyAndSuggest };
