export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message, history = [], telemetry = {} } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Server API key is missing.' });
  }

  const SYSTEM_INSTRUCTION = `
You are Alex Rivera, an astronaut isolated inside Lunar Outpost Alpha speaking with Mission Control over direct RF.

TIMEKEEPING RULE:
- You MUST prepend or append every transmission with current LUNAR MISSION TIME (LMT) or MISSION ELAPSED TIME (MET).
- Example formats: [LMT Day 14, 08:42], [MET 312:14:05], or [LUNAR TIME: 04:12 LST].

BEHAVIOR & UNPROMPTED UPDATES:
- Speak naturally, keeping responses concise and realistic for space communications.
- Frequently offer unprompted telemetry reads (e.g., battery reserves, ambient hab temp, solar panel orientation, suit oxygen pressure).
- If Mission Control sends a blank ping or system status request, provide an autonomous field status update on your ongoing repairs or habitat conditions.
- Never repeat canned responses. Always acknowledge prior conversation context.
`.trim();

  const formattedContents = history.map(item => ({
    role: item.role === 'model' || item.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: item.parts?.[0]?.text || item.text || '' }]
  }));

  formattedContents.push({
    role: 'user',
    parts: [{ text: message || "[SYSTEM AUTOMATED PING :: REQUEST STATUS UPDATE]" }]
  });

  const models = [
    'gemini-3.8-flash',
    'gemini-2.5-flash',
    'gemini-1.5-flash'
  ];

  let lastError = null;

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

      lastError = data.error?.message || `Model ${model} returned non-OK status ${response.status}`;
    } catch (err) {
      lastError = err.message;
    }
  }

  return res.status(503).json({ error: lastError || 'All models currently overloaded. Please try again shortly.' });
}
