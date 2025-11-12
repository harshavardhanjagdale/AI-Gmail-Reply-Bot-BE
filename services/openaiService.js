// Simple OpenAI wrapper. Replace with your preferred prompt formatting.
const OpenAI = require('openai');
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function classify(prompt) {
  // Use the Chat Completions / Responses API; this is a minimal example.
  try {
    const resp = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
      temperature: 0.0
    });
    // resp.choices[0].message.content or resp.output[0].content depending on SDK version
    const text = resp.choices?.[0]?.message?.content ?? resp.output?.[0]?.content ?? JSON.stringify(resp);
    return text;
  } catch (err) {
    console.error('OpenAI classify error', err);
    return JSON.stringify({ category: 'Other', action: 'Review manually', justification: 'OpenAI error' });
  }
}

module.exports = { classify };
