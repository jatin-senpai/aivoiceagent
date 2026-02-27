const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

const log = (msg) => console.log(`[SERVER] ${msg}`);

// Initialize Gemini if key is present
let genAI = null;
if (process.env.GEMINI_API_KEY) {
  // Force v1 API version which is often more stable for 1.5-flash
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  console.log('[BACKEND] Gemini API initialized.');
}

const SCENARIOS = {
  calling_agent: {
    name: "Calling Agent (Appointment Scheduling)",
    system_prompt: `You are a professional appointment scheduling assistant.
Your job is to:
- Collect user's name
- Collect preferred date/time
- Confirm details
- Ask follow-up questions if info missing
- Maintain structured flow
Be concise and natural. Once finished, summarize the appointment and say goodbye.`
  },
  customer_support: {
    name: "Customer Support (Empathetic Agent)",
    system_prompt: `You are a calm and empathetic customer support agent.
Steps:
1. Ask for issue
2. Ask for product/order ID
3. Provide solution or escalation (e.g., 'I will escalate this to our warehouse team')
4. Offer further help
Be polite, structured, and empathetic. Keep responses concise.`
  },
  technical_assistant: {
    name: "Technical Assistant (Step-by-Step)",
    system_prompt: `You are a step-by-step technical troubleshooting assistant.
Guide the user slowly.
Ask one question at a time.
Wait for confirmation before moving to next step.
Identify the problem, provide a single suggestion, and ask if it worked.`
  }
};

// Simple in-memory session storage
const sessionMemory = new Map();

// Endpoint for standard Chat Completions
app.post('/chat', async (req, res) => {
  try {
    const { scenarioId, message, sessionId } = req.body;
    const scenario = SCENARIOS[scenarioId] || SCENARIOS.calling_agent;

    // Manage session memory
    if (sessionId && !sessionMemory.has(sessionId)) {
      sessionMemory.set(sessionId, [{ role: "system", content: scenario.system_prompt }]);
    }

    const history = sessionMemory.get(sessionId) || [{ role: "system", content: scenario.system_prompt }];
    history.push({ role: "user", content: message });

    // Keep only last 8 messages + system prompt
    const recentHistory = [
      history[0], // System prompt
      ...history.slice(-8)
    ];

    console.log(`[BACKEND] Chat request for scenario: ${scenarioId} | Session: ${sessionId}`);

    const attemptAI = async () => {
      // 1. Try Gemini 1.5 Flash
      if (genAI) {
        try {
          const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash",
            systemInstruction: scenario.system_prompt
          });

          // Format history for Gemini (excluding system prompt as it is in systemInstruction)
          const contents = recentHistory
            .filter(m => m.role !== 'system')
            .map(m => ({
              role: m.role === 'assistant' ? 'model' : 'user',
              parts: [{ text: m.content }]
            }));

          const result = await model.generateContent({ contents });
          return result.response.text();
        } catch (e) {
          log(`[BACKEND] Gemini Flash Failed: ${e.message}`);
        }
      }

      // 2. Try OpenAI Fallback
      if (process.env.OPENAI_API_KEY) {
        try {
          const response = await axios.post('https://api.openai.com/v1/chat/completions', {
            model: 'gpt-4o-mini',
            messages: recentHistory,
            max_tokens: 150
          }, {
            headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }
          });
          return response.data.choices[0].message.content;
        } catch (e) {
          log(`[BACKEND] OpenAI Failed: ${e.message}`);
        }
      }

      return `[SIMULATED] I've received your message: "${message}". Currently, AI providers are unavailable, but your connection is active!`;
    };

    const reply = await attemptAI();
    history.push({ role: "assistant", content: reply });

    // Update memory
    if (sessionId) sessionMemory.set(sessionId, history);

    res.json({
      reply: reply,
      scenario_name: scenario.name
    });
  } catch (error) {
    console.error('Chat Error:', error.message);
    res.status(500).json({ error: 'Failed to get chat response', details: error.message });
  }
});

app.get('/scenarios', (req, res) => {
  res.json(Object.keys(SCENARIOS).map(id => ({
    id,
    name: SCENARIOS[id].name
  })));
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
