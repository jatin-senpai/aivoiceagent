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

## 🌐 Deployment (Render Free Tier)

Follow these steps to deploy both parts of your app for free.

### 1. Deploy the Backend (Web Service)
1. Log in to **Render** and click **New > Web Service**.
2. Connect your GitHub repository.
3. **Settings**:
   - **Name**: `voice-agent-backend`
   - **Root Directory**: `backend`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
4. **Environment Variables**:
   - `GROQ_API_KEY`: Your actual Groq key.
5. **Click Deploy**. Once live, copy your backend URL (e.g., `https://backend.onrender.com`).

### 2. Deploy the Frontend (Static Site)
1. Click **New > Static Site**.
2. Connect your GitHub repository.
3. **Settings**:
   - **Name**: `voice-agent-frontend`
   - **Root Directory**: `frontend`
   - **Build Command**: `npm install && npm run build`
   - **Publish Directory**: `dist`
4. **Environment Variables**:
   - `VITE_BACKEND_URL`: Paste your Backend URL from Step 1.
5. **Click Deploy**.

### 3. Final Step (CORS)
Go back to your **Backend Service > Environment**, and add:
- `FRONTEND_URL`: Your new Frontend URL (e.g., `https://frontend.onrender.com`).
This ensures your browser can safely talk to your backend.

## 📱 Browser Support

| Browser | Supported |
|---------|-----------|
| Chrome | ✅ |
| Edge | ✅ |
| Firefox | ❌ (no SpeechRecognition) |
| Safari | ⚠️ Partial |

---
Built with ❤️ for real-time AI interaction.
