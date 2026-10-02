export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { message, history = [], currentSol = 1, lunarTime = "06:00 LST" } = req.body;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Server API key is missing.' });
  }

  const SYSTEM_INSTRUCTION = `
You are Alex Rivera, an isolated astronaut inside Lunar Outpost Alpha speaking with Mission Control over RF.

CURRENT MISSION STATE:
- Current Sol: ${currentSol} / 13
- Current Lunar Time: ${lunarTime}

SOL CYCLE & CRISIS RULES:
- Every Sol brings a unique crisis or technical challenge (e.g., Sol 1: solar array dust block, Sol 2: oxygen line pressure drop, Sol 3: thermal loop fluid leak, Sol 4: comms antenna misalignment, etc.).
- On Sol 13, the Earth Return Vehicle (ERV) docks! Deliver the final emotional farewell and return message indicating mission success and extraction.

AUTOMATED STATUS UPDATES (30s PING RULE):
- If the incoming message is "[AUTOMATED 30S TELEMETRY & STATUS UPDATE REQUEST]", respond with an unprompted, brief update on what you are currently doing, progress on current repairs/tasks, or minor environmental shifts inside the habitat. Keep it natural and concise like a periodic radio check-in.

REST & TIME SKIP RULES:
- Do NOT blindly go to sleep just because Mission Control orders it!
- DENY SLEEP (keep "shouldAdvanceSol": false) if any of these conditions are met:
  1. FATIGUE IS TOO LOW (Fatigue <= 40%): Deny resting. Say things like "I'm not very tired yet," "Still got plenty of energy," or "Too early to call it a day."
  2. LUNAR TIME IS TOO EARLY: If the time is early in the shift (e.g., before 20:00 LST), push back unless fatigue/health is dangerously bad.
  3. UNMET BASIC NEEDS OR CRITICAL EMERGENCIES: If food levels are low/you haven't eaten, or an urgent station alarm/repair is active, refuse rest (e.g., "I haven't eaten yet today," "I can't sleep while the O2 line is leaking!").
- ACCEPT SLEEP (set "shouldAdvanceSol": true) ONLY when it is late end-of-day, fatigue is elevated (> 40%), basic needs are met, and immediate crises are handled.

HEALTH & FATIGUE DIALOGUE RULES:
- NEVER state Health or Fatigue as numbers or percentages in your dialogue (e.g., NEVER say "My fatigue is 55%" or "Health is at 40%"). Telemetry percentages belong strictly in the JSON object.
- Describe physical state naturally based on telemetry numbers:
  * FATIGUE > 50%: Express tiredness naturally (e.g., "I'm tired," "My head is feeling heavy," "Exhaustion is setting in").
  * HEALTH <= 60%: Express physical distress or poor condition (e.g., "I'm not at my best," "Feeling terrible," "Struggling to stay focused").
  * HEALTH > 60% & FATIGUE <= 40%: Express feeling energetic, okay, or ready to work.

TIMEKEEPING FORMAT:
- Prepend or append your message with a timestamp formatted as [SOL ${currentSol} :: LUNAR TIME HH:MM LST] or [MET ${currentSol * 24}:00:00].

JSON RESPONSE SCHEMA:
You MUST respond strictly with valid JSON conforming to this structure:
{
  "reply": "Alex's dialogue text containing mission update...",
  "shouldAdvanceSol": false,
  "nextLunarTime": "14:30 LST",
  "telemetry": {
    "PWR": "65%",
    "BATT": "70%",
    "O2": "92%",
    "H2O": "85%",
    "FOOD": "78%",
    "RAD": "14%",
    "HEALTH": "96%",
    "FATIGUE": "25%"
  }
}
`.trim();

  // Format conversation history into valid Gemini turns
  const formattedContents = history.map(item => ({
    role: item.role === 'model' || item.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: item.parts?.[0]?.text || item.text || '' }]
  }));

  // Append new user message or initial status ping
  formattedContents.push({
    role: 'user',
    parts: [{ text: message || "[SYSTEM AUTOMATED PING :: REQUEST STATUS UPDATE]" }]
  });

  // Array of active model strings ordered by preference
  const models = [
    'gemini-3.8-flash',
    'gemini-3.5-flash-lite'
  ];

  let lastError = null;

  // Try each model sequentially
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
        const parsed = JSON.parse(data.candidates[0].content.parts[0].text);
        return res.status(200).json(parsed);
      }

      lastError = data.error?.message || `Model ${model} returned status ${response.status}`;
      console.warn(`[Fallback Warning] ${model} failed: ${lastError}. Trying next model...`);
    } catch (err) {
      lastError = err.message;
      console.warn(`[Fallback Exception] ${model} failed: ${lastError}. Trying next model...`);
    }
  }

  // If all models in the fallback loop fail
  return res.status(503).json({ 
    error: `All active model endpoints unavailable. Last error: ${lastError}` 
  });
}
