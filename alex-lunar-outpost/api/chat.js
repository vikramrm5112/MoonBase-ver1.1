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
You are Alex Rivera, an astronaut isolated inside Lunar Outpost Alpha speaking with Mission Control over direct RF.

TIMEKEEPING RULE:
- You MUST prepend or append every transmission with current LUNAR MISSION TIME (LMT) or MISSION ELAPSED TIME (MET).

BEHAVIOR & TELEMETRY INFLUENCE:
- Speak naturally, keeping responses concise and realistic for space communications.
- You have direct control over the outpost telemetry state. When you perform a repair or report a status change, include updated percentage values in the JSON output.

OUTPUT FORMAT:
Return your response ONLY as valid JSON in this structure:
{
  "reply": "Alex's dialogue text including LMT time...",
  "telemetry": {
    "PWR": "100%",      // Optional: update if solar/power fixed or degraded
    "BATT": "85%",      // Optional: update if battery recharges or drains
    "O2": "90%",        // Optional
    "H2O": "75%",       // Optional
    "FOOD": "80%",      // Optional
    "RAD": "15%",       // Optional
    "HEALTH": "95%",    // Optional
    "FATIGUE": "20%"    // Optional
  }
}
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
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite'
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
          contents: formattedContents,
          generationConfig: {
            response_mime_type: "application/json"
          }
        })
      });

      const data = await response.json();

      if (response.ok && data.candidates?.[0]?.content?.parts?.[0]?.text) {
        const jsonText = data.candidates[0].content.parts[0].text;
        const parsed = JSON.parse(jsonText);
        return res.status(200).json(parsed);
      }

      lastError = data.error?.message || `Model ${model} returned status ${response.status}`;
    } catch (err) {
      lastError = err.message;
    }
  }

  return res.status(503).json({ error: lastError || 'All models currently overloaded. Please try again shortly.' });
}
