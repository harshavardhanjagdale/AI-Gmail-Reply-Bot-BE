const OpenAI = require('openai');
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function classify(prompt) {
  try {
    const resp = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
      temperature: 0.0
    });
    const text = resp.choices?.[0]?.message?.content ?? resp.output?.[0]?.content ?? JSON.stringify(resp);
    return text;
  } catch (err) {
    return JSON.stringify({ category: 'Other', action: 'Review manually', justification: 'OpenAI error' });
  }
}

module.exports = { classify };
