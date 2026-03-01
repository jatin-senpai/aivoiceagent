# VoiceAgent — Real-Time AI Voice Conversation Portal

Experience two-way voice conversations with AI agents. This project demonstrates real-time Speech-to-Text (STT), AI processing with Groq (Llama 3), and Text-to-Speech (TTS) streaming.

```
Browser STT → React (Vite) → Express Backend → Groq (Llama 3) → React → Browser TTS
```

## 🚀 Quick Start — 3 Steps

### 1. Prerequisites
- **Node.js 18+** installed.
- **Chrome or Edge** browser (required for the Web Speech API).
- A **Groq API key** (get one free at [console.groq.com](https://console.groq.com)).

### 2. Backend Setup
```bash
cd backend
cp .env.example .env
# Open .env and set your GROQ_API_KEY
npm install
npm start
```
*Backend runs at http://localhost:3001*

### 3. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
*Frontend runs at http://localhost:5173*

---

## 🛠 Project Structure

```
├── backend/
│   ├── server.js        # Express server, proxies Groq API with SSE streaming
│   ├── package.json
│   └── .env.example     # Template for environment variables
│
├── frontend/
│   ├── src/
│   │   ├── main.jsx     # React entry point
│   │   └── App.jsx      # Core application logic & UI
│   ├── index.html
│   ├── vite.config.js   # Dev configuration with backend proxy
│   └── package.json
│
└── README.md            # Global documentation
```

---

## 🎭 Scenarios

Select from pre-defined AI personas:
- **📞 Calling Agent**: Appointment scheduling and confirmation.
- **🎧 Customer Support**: Handling queries and complaints with empathy.
- **🔧 Technical Assistant**: Guided step-by-step troubleshooting.

## 📡 API Endpoints

- `POST /api/chat`: Primary endpoint for streaming AI responses.
- `GET /health`: Server status check.
- `GET /analytics`: Session usage statistics.

## 🔒 Security Note
Environment variables (`.env`) are ignored by Git to protect API keys. Always use `.env.example` as a template for new deployments.

---
Built with ❤️ for real-time AI interaction.
