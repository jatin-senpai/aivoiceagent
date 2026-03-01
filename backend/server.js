const express = require("express");
const cors = require("cors");
const https = require("https");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || "*",
  methods: ["GET", "POST"],
}));
app.use(express.json({ limit: "1mb" }));

// ─── Request Logger ───────────────────────────────────────────────────────────
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} ${res.statusCode} +${Date.now() - start}ms`);
  });
  next();
});

// ─── In-Memory Analytics ──────────────────────────────────────────────────────
const analytics = {
  sessions: [],
  record(data) {
    this.sessions.push({ ...data, timestamp: Date.now() });
    if (this.sessions.length > 1000) this.sessions.shift();
  },
  stats() {
    const total = this.sessions.length;
    const last100 = this.sessions.slice(-100);
    const avgLatency = last100.length
      ? Math.round(last100.reduce((a, b) => a + (b.ttfb || 0), 0) / last100.length)
      : 0;
    const scenarios = this.sessions.reduce((acc, s) => {
      acc[s.scenario] = (acc[s.scenario] || 0) + 1;
      return acc;
    }, {});
    return { totalRequests: total, avgTtfbMs: avgLatency, scenarioCounts: scenarios };
  },
};

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    uptime: Math.round(process.uptime()),
    timestamp: Date.now(),
    provider: "Groq (Llama 3)",
    apiKey: process.env.GROQ_API_KEY ? "configured" : "MISSING",
  });
});

// ─── Analytics ────────────────────────────────────────────────────────────────
app.get("/analytics", (req, res) => {
  res.json(analytics.stats());
});

// ─── POST /api/chat — Streams Groq Llama 3 responses via SSE ─────────────────
app.post("/api/chat", (req, res) => {
  const { messages, systemPrompt, scenario } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "messages array is required" });
  }
  if (!systemPrompt || typeof systemPrompt !== "string") {
    return res.status(400).json({ error: "systemPrompt is required" });
  }
  if (!process.env.GROQ_API_KEY) {
    return res.status(500).json({ error: "GROQ_API_KEY not configured on server" });
  }

  const groqMessages = [
    { role: "system", content: systemPrompt },
    ...messages,
  ];

  const t0 = Date.now();
  let ttfb = null;
  let totalChars = 0;
  let headersSent = false;

  const sendSSEHeaders = () => {
    if (!headersSent) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();
      headersSent = true;
    }
  };

  (async () => {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          max_tokens: 1000,
          stream: true,
          messages: groqMessages,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error("Groq API error:", errText);
        try {
          const parsed = JSON.parse(errText);
          return res.status(response.status).json({ error: parsed.error?.message || "Groq API error" });
        } catch {
          return res.status(response.status).json({ error: `HTTP ${response.status}` });
        }
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          const data = trimmed.slice(6).trim();

          if (data === "[DONE]") {
            const totalMs = Date.now() - t0;
            analytics.record({ scenario: scenario || "unknown", ttfb, totalMs, chars: totalChars });
            res.write(`data: ${JSON.stringify({ type: "done", totalMs, ttfb, chars: totalChars })}\n\n`);
            res.end();
            return;
          }

          try {
            const parsed = JSON.parse(data);
            const text = parsed.choices?.[0]?.delta?.content;
            if (text) {
              sendSSEHeaders();
              if (ttfb === null) {
                ttfb = Date.now() - t0;
                res.write(`data: ${JSON.stringify({ type: "ttfb", ms: ttfb })}\n\n`);
              }
              totalChars += text.length;
              res.write(`data: ${JSON.stringify({ type: "delta", text })}\n\n`);
            }
          } catch (e) {
            // Minor parsing error, usually not critical for streaming
          }
        }
      }

      // Ensure response is ended if stream finishes without [DONE]
      if (!res.writableEnded) {
        analytics.record({ scenario: scenario || "unknown", ttfb, totalMs: Date.now() - t0, chars: totalChars });
        res.write(`data: ${JSON.stringify({ type: "done", totalMs: Date.now() - t0, ttfb, chars: totalChars })}\n\n`);
        res.end();
      }

    } catch (err) {
      console.error("Fetch error:", err);
      if (!res.writableEnded) {
        if (!headersSent) sendSSEHeaders();
        res.write(`data: ${JSON.stringify({ type: "error", error: err.message })}\n\n`);
        res.end();
      }
    }
  })();
});

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🎙  Voice Agent Backend`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`   Provider: Groq (llama-3.3-70b-versatile)`);
  console.log(`   API key: ${process.env.GROQ_API_KEY ? "✅ configured" : "❌ MISSING — set GROQ_API_KEY in .env"}`);
  console.log(`   CORS origin: ${process.env.FRONTEND_URL || "* (all)"}\n`);
});
