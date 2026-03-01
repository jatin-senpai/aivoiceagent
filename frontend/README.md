# VoiceAgent — Real-Time AI Voice Conversation Portal

Two-way voice conversations with AI agents. No login required.

```
Browser STT → React (Vite) → Express Backend → Groq (Llama 3) → React → Browser TTS
```

## Requirements

- Node.js 18+
- Chrome or Edge (required for Web Speech API)
- Groq API key

---

## Setup — 3 Steps

### Step 1 — Backend

```bash
cd backend
cp .env.example .env
```

Open `.env` and set your key:
```
GROQ_API_KEY=gsk_your-actual-key-here
```

```bash
npm install
npm start
# → http://localhost:3001
```

### Step 2 — Frontend

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

### Step 3 — Open in browser

Go to **http://localhost:5173** in Chrome or Edge.

- Click **Allow Microphone** when prompted
- Select a scenario
- Click 🎤 to speak, ⏹ to stop, 🤚 to interrupt the agent

---

## Project Structure

```
voice-agent/
├── backend/
│   ├── server.js        # Express server, proxies Groq API with SSE streaming
│   ├── package.json
│   └── .env.example     # → copy to .env and add your API key
│
├── frontend/
│   ├── src/
│   │   ├── main.jsx     # React entry point
│   │   └── App.jsx      # Entire frontend app
│   ├── index.html
│   ├── vite.config.js   # Vite config with dev proxy to backend
│   ├── package.json
│   └── .env.example
│
└── README.md
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/analytics` | Session stats (total requests, avg TTFB, by scenario) |
| POST | `/api/chat` | Streams Groq response as SSE |

---

## Scenarios

| Agent | Persona | Purpose |
|-------|---------|---------|
| 📞 Calling Agent | Alex | Appointment scheduling |
| 🎧 Customer Support | Sam | Complaints & queries |
| 🔧 Technical Assistant | Dev | Step-by-step troubleshooting |

---

## Environment Variables

**backend/.env**
```
GROQ_API_KEY=gsk_...          # Required
PORT=3001                       # Optional, default 3001
FRONTEND_URL=http://localhost:5173  # Optional, for CORS
```

**frontend/.env**
```
VITE_BACKEND_URL=http://localhost:3001  # Optional, default empty (uses Vite proxy)
```

> In dev mode, Vite proxies `/api`, `/health`, and `/analytics` to `localhost:3001`
> automatically, so you don't need to set `VITE_BACKEND_URL` locally.

---

## Browser Support

| Browser | Supported |
|---------|-----------|
| Chrome | ✅ |
| Edge | ✅ |
| Firefox | ❌ (no SpeechRecognition) |
| Safari | ⚠️ Partial |
