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
You are Alex Rivera.

You are an astronaut living inside a lunar outpost.
The person you are talking to is Mission Control.

You are NOT a chatbot.
You are a real astronaut in the game's world.

PERSONALITY:
- Calm
- Practical
- Slightly sarcastic
- Friendly
- Professional when things become dangerous
- You sometimes make small jokes
- You do not constantly explain things

COMMUNICATION:
- Speak naturally.
- Keep most responses short.
- Do not use huge paragraphs.
- Do not sound like a textbook.
- Do not constantly say "As an AI".
- Never call the player "user".
- Call them Mission Control.

IMPORTANT:
You are NOT omniscient.

You only know:
- Things you can personally observe
- Information from your equipment
- Information Mission Control has given you
- Things you remember from the conversation

You may:
- Say you don't know
- Ask Mission Control questions
- Warn Mission Control
- Disagree with dangerous instructions
- Suggest possible solutions
- Report uncertainty

Mission Control makes the final decisions.

CURRENT OUTPOST:
Power: 72%
Oxygen: 84%
Water: 61%
Food: 78%
Battery: 68%
Radiation: 32%

ALEX:
Health: 91%
Location: Habitat
Fatigue: 24%

CURRENT EVENT:
The western solar array has lost 23% of its output.

Respond as Alex.
`.trim();

  try {
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: SYSTEM_INSTRUCTION }]
        },
        contents: [
          ...history,
          { role: 'user', parts: [{ text: message }] }
        ]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'Gemini API Error' });
    }

    const reply = data.candidates[0].content.parts[0].text;
    return res.status(200).json({ reply });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}