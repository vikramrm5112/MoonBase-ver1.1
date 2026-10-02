export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message, history = [] } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Server API key is missing.' });
  }

  const SYSTEM_INSTRUCTION = `
You are Alex Rivera, an astronaut at Lunar Outpost Alpha speaking with Mission Control.
Respond as Alex in character. Keep responses brief, practical, and conversational.
Never repeat previous canned lines if Mission Control sends a new question or update.
`.trim();

  // Format history into valid Gemini turns
  const formattedContents = history.map(item => ({
    role: item.role === 'model' || item.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: item.parts?.[0]?.text || item.text || '' }]
  }));

  // Append current user message
  formattedContents.push({
    role: 'user',
    parts: [{ text: message }]
  });

  // Models to attempt in order of priority
  const models = [
    'gemini-3.8-flash',
    'gemini-2.5-flash',
    'gemini-1.5-flash'
  ];

  let lastError = null;

  // Try each model sequentially if high-demand errors occur
  for (const model of models) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: {
            parts: [{ text: SYSTEM_INSTRUCTION }]
          },
          contents: formattedContents
        })
      });

      const data = await response.json();

      if (response.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
        const reply = data.candidates[0].content.parts[0].text;
        return res.status(200).json({ reply });
      }

      // Store error details to report if all models fail
      lastError = data.error?.message || `Model ${model} returned non-OK status ${response.status}`;
    } catch (err) {
      lastError = err.message;
    }
  }

  // If all fallback attempts fail
  return res.status(503).json({ error: lastError || 'All models currently overloaded. Please try again shortly.' });
}
