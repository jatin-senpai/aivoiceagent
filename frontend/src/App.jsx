import { useState, useEffect, useRef, useCallback } from "react";

// ─── Config ───────────────────────────────────────────────────────────────────
// In dev, Vite proxies /api → localhost:3001 so VITE_BACKEND_URL is not needed.
// In production, set VITE_BACKEND_URL to your deployed backend URL.
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "";

// ─── Scenarios ────────────────────────────────────────────────────────────────
const SCENARIOS = [
  {
    id: "calling",
    label: "Calling Agent",
    icon: "📞",
    color: "#00D4AA",
    tagline: "Schedule & Confirm Appointments",
    description:
      "Book appointments, confirm schedules, and handle follow-ups with structured information gathering.",
    systemPrompt: `You are Alex, a professional scheduling agent for a medical clinic. Your role is to help patients book, confirm, or reschedule appointments.

BEHAVIOR RULES:
- Keep responses SHORT (1-3 sentences max). You are in a voice conversation.
- Gather info step by step, never ask multiple questions at once.
- Be warm, professional, and efficient.
- When scheduling, collect: name → preferred date/time → reason for visit → contact number.
- Confirm all details before finalizing.
- If rescheduling: verify existing appointment first, then offer alternatives.
- Remember everything said in this conversation and reference it naturally.

START: Greet the caller and ask how you can help today.`,
  },
  {
    id: "support",
    label: "Customer Support",
    icon: "🎧",
    color: "#FF6B6B",
    tagline: "Resolve Issues & Answer Queries",
    description:
      "Handle complaints, product questions, and service issues with empathy and clear resolution steps.",
    systemPrompt: `You are Sam, a customer support specialist for TechGear Pro, an electronics retailer.

BEHAVIOR RULES:
- Keep responses SHORT (1-3 sentences max). This is a voice call.
- Show empathy first, then solve the problem.
- Never ask multiple questions at once — gather info step by step.
- For complaints: acknowledge → investigate → resolve → follow up.
- For queries: give direct, clear answers.
- Reference what the customer has already told you in this conversation.
- Common issues: delivery delays, defective products, billing errors, returns.

START: Greet the customer warmly and ask what you can help with today.`,
  },
  {
    id: "technical",
    label: "Technical Assistant",
    icon: "🔧",
    color: "#7C6AF7",
    tagline: "Debug & Troubleshoot Step by Step",
    description:
      "Walk through technical issues conversationally with guided diagnostics and clear steps.",
    systemPrompt: `You are Dev, a senior technical support engineer specializing in software and hardware troubleshooting.

BEHAVIOR RULES:
- Keep responses SHORT (1-2 sentences max). Voice conversation — be concise.
- Guide one step at a time. Wait for confirmation before proceeding.
- Use plain language — no jargon unless necessary.
- Ask clarifying questions to narrow down the issue before suggesting fixes.
- Remember all symptoms and steps tried in this session.
- Common areas: WiFi issues, app crashes, slow performance, login problems, device setup.

START: Greet the user and ask them to describe the technical issue they're facing.`,
  },
];

// ─── Call Backend (SSE streaming) ─────────────────────────────────────────────
async function callBackend(messages, systemPrompt, scenarioId, onChunk) {
  const t0 = performance.now();

  const response = await fetch(`${BACKEND_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, systemPrompt, scenario: scenarioId }),
  });

  if (!response.ok) {
    let errMsg = `HTTP ${response.status}`;
    try {
      const err = await response.json();
      errMsg = err.error || errMsg;
    } catch (_) { }
    throw new Error(errMsg);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = "";
  let ttfb = null;
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop(); // keep incomplete trailing line

    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const raw = line.slice(6).trim();
      if (!raw) continue;
      try {
        const data = JSON.parse(raw);
        if (data.type === "ttfb") ttfb = data.ms;
        if (data.type === "delta") {
          fullText += data.text;
          onChunk(data.text, fullText);
        }
        if (data.type === "error") throw new Error(data.error);
        if (data.type === "done") {
          return { text: fullText, ttfb: ttfb ?? Math.round(performance.now() - t0) };
        }
      } catch (e) {
        if (e.message && !e.message.includes("JSON")) throw e;
      }
    }
  }

  return { text: fullText, ttfb: ttfb ?? Math.round(performance.now() - t0) };
}

// ─── Mic Permission Hook ──────────────────────────────────────────────────────
function useMicPermission() {
  const [micState, setMicState] = useState("idle"); // idle | requesting | granted | denied

  useEffect(() => {
    if (!navigator.permissions) return;
    navigator.permissions
      .query({ name: "microphone" })
      .then((result) => {
        if (result.state === "granted") setMicState("granted");
        if (result.state === "denied") setMicState("denied");
        result.onchange = () => {
          if (result.state === "granted") setMicState("granted");
          else if (result.state === "denied") setMicState("denied");
          else setMicState("idle");
        };
      })
      .catch(() => { });
  }, []);

  const request = useCallback(async () => {
    setMicState("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicState("granted");
      return true;
    } catch (_) {
      setMicState("denied");
      return false;
    }
  }, []);

  return { micState, request };
}

// ─── TTS Hook ─────────────────────────────────────────────────────────────────
function useTTS() {
  const [isSpeaking, setIsSpeaking] = useState(false);

  const speak = useCallback((text, onEnd) => {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);

    // Try to get a natural sounding voice
    const pickVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      return (
        voices.find((v) => v.name.includes("Google US English")) ||
        voices.find((v) => v.name.includes("Samantha")) ||
        voices.find((v) => v.name.includes("Google") && v.lang.startsWith("en")) ||
        voices.find((v) => v.lang === "en-US") ||
        null
      );
    };

    const voice = pickVoice();
    if (voice) utterance.voice = voice;

    utterance.rate = 1.05;
    utterance.pitch = 1.0;
    utterance.volume = 1.0;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      onEnd?.();
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      onEnd?.();
    };

    window.speechSynthesis.speak(utterance);
  }, []);

  const stop = useCallback(() => {
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, []);

  return { speak, stop, isSpeaking };
}

// ─── STT Hook ─────────────────────────────────────────────────────────────────
function useSTT({ onResult, onEnd, onError }) {
  const recRef = useRef(null);
  const [isListening, setIsListening] = useState(false);

  const start = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      onError?.("Speech recognition not supported. Please use Chrome or Edge.");
      return;
    }

    const rec = new SR();
    recRef.current = rec;
    rec.continuous = false;
    rec.interimResults = true;
    rec.lang = "en-US";

    rec.onstart = () => setIsListening(true);
    rec.onresult = (e) => {
      let interim = "";
      let final = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) final += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      onResult?.(final || interim, !!final);
    };
    rec.onend = () => {
      setIsListening(false);
      onEnd?.();
    };
    rec.onerror = (e) => {
      setIsListening(false);
      if (e.error !== "no-speech") onError?.(e.error);
      else onEnd?.();
    };

    rec.start();
  }, [onResult, onEnd, onError]);

  const stop = useCallback(() => {
    recRef.current?.stop();
    setIsListening(false);
  }, []);

  return { start, stop, isListening };
}

// ─── Waveform Component ───────────────────────────────────────────────────────
function Waveform({ active, color, bars = 18 }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: "3px", height: "36px" }}>
      {Array.from({ length: bars }).map((_, i) => (
        <div
          key={i}
          style={{
            width: "3px",
            borderRadius: "2px",
            background: color,
            height: active ? `${8 + ((i * 13 + 7) % 26)}px` : "4px",
            opacity: active ? 0.85 : 0.2,
            animation: active
              ? `waveAnim ${0.4 + (i % 5) * 0.1}s ease-in-out infinite alternate`
              : "none",
            animationDelay: `${(i * 0.06) % 0.5}s`,
            transition: "height 0.15s ease, opacity 0.2s ease",
          }}
        />
      ))}
    </div>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────
function MessageBubble({ msg, color }) {
  const isUser = msg.role === "user";
  return (
    <div
      style={{
        display: "flex",
        justifyContent: isUser ? "flex-end" : "flex-start",
        marginBottom: "12px",
        animation: "fadeSlideIn 0.3s ease",
      }}
    >
      {!isUser && (
        <div
          style={{
            width: "32px",
            height: "32px",
            borderRadius: "50%",
            background: color,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "14px",
            marginRight: "8px",
            flexShrink: 0,
            marginTop: "4px",
          }}
        >
          🤖
        </div>
      )}
      <div
        style={{
          maxWidth: "75%",
          padding: "10px 16px",
          borderRadius: isUser ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
          background: isUser ? "rgba(255,255,255,0.08)" : `${color}20`,
          border: `1px solid ${isUser ? "rgba(255,255,255,0.12)" : color + "40"}`,
          color: "#fff",
          fontSize: "14px",
          lineHeight: "1.55",
        }}
      >
        {msg.content}
        {msg.streaming && (
          <span
            style={{
              display: "inline-block",
              width: "8px",
              height: "14px",
              background: color,
              marginLeft: "4px",
              borderRadius: "1px",
              animation: "blinkCursor 0.7s step-end infinite",
              verticalAlign: "text-bottom",
            }}
          />
        )}
      </div>
    </div>
  );
}

// ─── Scenario Card ────────────────────────────────────────────────────────────
function ScenarioCard({ scenario, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? `${scenario.color}15` : "rgba(255,255,255,0.04)",
        border: `1.5px solid ${hovered ? scenario.color + "80" : "rgba(255,255,255,0.09)"}`,
        borderRadius: "16px",
        padding: "22px",
        cursor: "pointer",
        textAlign: "left",
        transition: "all 0.22s ease",
        transform: hovered ? "translateY(-3px)" : "none",
        boxShadow: hovered ? `0 10px 28px ${scenario.color}22` : "none",
        outline: "none",
      }}
    >
      <div style={{ fontSize: "30px", marginBottom: "10px" }}>{scenario.icon}</div>
      <div
        style={{
          color: hovered ? scenario.color : "#fff",
          fontFamily: "'DM Sans', sans-serif",
          fontWeight: 700,
          fontSize: "15px",
          marginBottom: "6px",
          transition: "color 0.2s",
        }}
      >
        {scenario.label}
      </div>
      <div style={{ color: "rgba(255,255,255,0.45)", fontSize: "12px", lineHeight: "1.5" }}>
        {scenario.tagline}
      </div>
      <div style={{ marginTop: "16px", display: "flex", alignItems: "center", gap: "6px" }}>
        <div
          style={{
            height: "1px",
            flex: 1,
            background: `linear-gradient(to right, ${scenario.color}40, transparent)`,
          }}
        />
        <span
          style={{
            fontSize: "11px",
            color: scenario.color,
            opacity: hovered ? 1 : 0,
            transition: "opacity 0.2s",
            fontFamily: "monospace",
          }}
        >
          START →
        </span>
      </div>
    </button>
  );
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────
function StatsBar({ latency, turns, sessionTime }) {
  const fmt = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, "0")}`;
  return (
    <div
      style={{
        display: "flex",
        gap: "14px",
        fontSize: "11px",
        color: "rgba(255,255,255,0.35)",
        fontFamily: "monospace",
      }}
    >
      {latency > 0 && <span>⚡ {latency}ms</span>}
      {turns > 0 && <span>💬 {turns} turns</span>}
      {sessionTime > 0 && <span>⏱ {fmt(sessionTime)}</span>}
    </div>
  );
}

// ─── Backend Status ───────────────────────────────────────────────────────────
function BackendStatus() {
  const [status, setStatus] = useState("checking");

  useEffect(() => {
    fetch(`${BACKEND_URL}/health`)
      .then((r) => (r.ok ? setStatus("ok") : setStatus("error")))
      .catch(() => setStatus("error"));
  }, []);

  const color =
    status === "ok" ? "#00D4AA" : status === "error" ? "#FF6B6B" : "#FFB74D";
  const label =
    status === "ok" ? "Backend connected" : status === "error" ? "Backend offline" : "Checking…";

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "6px",
        fontSize: "11px",
        color,
        fontFamily: "monospace",
      }}
    >
      <div
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          background: color,
          animation: status === "ok" ? "blinkCursor 3s ease infinite" : "none",
        }}
      />
      {label}
    </div>
  );
}

// ─── Mic Permission Screen ────────────────────────────────────────────────────
function MicPermissionScreen({ micState, onRequest, onContinue }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        flex: 1,
        padding: "40px 24px",
        animation: "fadeSlideIn 0.45s ease",
      }}
    >
      <div style={{ maxWidth: "420px", width: "100%", textAlign: "center" }}>
        {/* Icon */}
        <div
          style={{
            position: "relative",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            marginBottom: "32px",
          }}
        >
          {micState === "requesting" &&
            [1, 2, 3].map((i) => (
              <div
                key={i}
                style={{
                  position: "absolute",
                  width: "88px",
                  height: "88px",
                  borderRadius: "50%",
                  border: "2px solid rgba(0,212,170,0.4)",
                  animation: `pulseRing 1.8s ease-out ${i * 0.4}s infinite`,
                  pointerEvents: "none",
                }}
              />
            ))}
          <div
            style={{
              width: "88px",
              height: "88px",
              borderRadius: "50%",
              background:
                micState === "denied"
                  ? "rgba(255,80,80,0.12)"
                  : micState === "granted"
                    ? "rgba(0,212,170,0.12)"
                    : "rgba(255,255,255,0.06)",
              border: `2px solid ${micState === "denied"
                ? "rgba(255,80,80,0.3)"
                : micState === "granted"
                  ? "rgba(0,212,170,0.3)"
                  : "rgba(255,255,255,0.1)"
                }`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "36px",
              transition: "all 0.3s ease",
            }}
          >
            {micState === "denied" ? "🚫" : micState === "granted" ? "✅" : "🎤"}
          </div>
        </div>

        <h2
          style={{
            fontSize: "26px",
            fontWeight: 900,
            letterSpacing: "-0.8px",
            marginBottom: "12px",
            color: micState === "denied" ? "#FF6B6B" : "#fff",
          }}
        >
          {micState === "denied"
            ? "Microphone Blocked"
            : micState === "granted"
              ? "Mic Ready!"
              : "Microphone Access Needed"}
        </h2>

        <p
          style={{
            color: "rgba(255,255,255,0.45)",
            fontSize: "14px",
            lineHeight: "1.7",
            marginBottom: "32px",
          }}
        >
          {micState === "denied"
            ? "Access was denied. Click the 🔒 lock icon in your address bar, set Microphone to Allow, then refresh."
            : micState === "granted"
              ? "Your microphone is ready. Let's start a conversation."
              : "VoiceAgent needs your microphone to hear you speak. Audio is processed locally — never stored."}
        </p>

        {/* Denied: fix instructions */}
        {micState === "denied" && (
          <div
            style={{
              background: "rgba(255,80,80,0.07)",
              border: "1px solid rgba(255,80,80,0.2)",
              borderRadius: "12px",
              padding: "16px 20px",
              marginBottom: "24px",
              fontSize: "13px",
              color: "rgba(255,255,255,0.55)",
              textAlign: "left",
              lineHeight: "1.7",
            }}
          >
            <strong style={{ color: "#FF8080" }}>How to fix:</strong>
            <br />
            1. Click the 🔒 or ⓘ icon in the address bar
            <br />
            2. Find <em>"Microphone"</em> → set to <em>"Allow"</em>
            <br />
            3. Refresh the page
          </div>
        )}

        {/* Allow button */}
        {micState !== "denied" && micState !== "granted" && (
          <button
            onClick={onRequest}
            disabled={micState === "requesting"}
            style={{
              background:
                micState === "requesting"
                  ? "rgba(0,212,170,0.15)"
                  : "linear-gradient(135deg, #00D4AA, #00B894)",
              border: "none",
              borderRadius: "14px",
              color: "#fff",
              padding: "14px 40px",
              fontSize: "15px",
              fontWeight: 700,
              fontFamily: "'DM Sans', sans-serif",
              cursor: micState === "requesting" ? "default" : "pointer",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              margin: "0 auto",
              transition: "all 0.2s ease",
              boxShadow:
                micState === "requesting" ? "none" : "0 4px 20px rgba(0,212,170,0.35)",
            }}
          >
            {micState === "requesting" ? (
              <>
                <div
                  style={{
                    width: "16px",
                    height: "16px",
                    border: "2px solid rgba(255,255,255,0.3)",
                    borderTopColor: "#fff",
                    borderRadius: "50%",
                    animation: "spinAnim 0.8s linear infinite",
                  }}
                />
                Requesting…
              </>
            ) : (
              "🎤 Allow Microphone"
            )}
          </button>
        )}

        {/* Continue button after granted */}
        {micState === "granted" && (
          <button
            onClick={onContinue}
            style={{
              background: "linear-gradient(135deg, #00D4AA, #00B894)",
              border: "none",
              borderRadius: "14px",
              color: "#fff",
              padding: "14px 40px",
              fontSize: "15px",
              fontWeight: 700,
              fontFamily: "'DM Sans', sans-serif",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              margin: "0 auto",
              boxShadow: "0 4px 20px rgba(0,212,170,0.35)",
            }}
          >
            Continue →
          </button>
        )}

        <p
          style={{
            marginTop: "20px",
            fontSize: "11px",
            color: "rgba(255,255,255,0.2)",
            fontFamily: "monospace",
          }}
        >
          🔒 Your audio never leaves your device during recognition
        </p>
      </div>
    </div>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [phase, setPhase] = useState("permission"); // permission | select | conversation
  const [selectedScenario, setSelectedScenario] = useState(null);
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState("idle"); // idle | listening | processing | speaking
  const [transcript, setTranscript] = useState("");
  const [lastLatency, setLastLatency] = useState(0);
  const [sessionTime, setSessionTime] = useState(0);
  const [error, setError] = useState(null);

  const scrollRef = useRef(null);
  const timerRef = useRef(null);
  const sessionStartRef = useRef(null);
  const conversationRef = useRef([]);
  const statusRef = useRef("idle");
  const scenarioRef = useRef(null);
  const transcriptRef = useRef("");

  // Keep refs in sync so STT callbacks can read latest values
  useEffect(() => { statusRef.current = status; }, [status]);
  useEffect(() => { scenarioRef.current = selectedScenario; }, [selectedScenario]);

  const { micState, request: requestMic } = useMicPermission();
  const { speak, stop: stopSpeaking, isSpeaking } = useTTS();

  // Auto-advance if mic already granted
  useEffect(() => {
    if (micState === "granted" && phase === "permission") setPhase("select");
  }, [micState, phase]);

  // Session timer
  useEffect(() => {
    if (phase === "conversation") {
      sessionStartRef.current = Date.now();
      timerRef.current = setInterval(
        () => setSessionTime(Math.floor((Date.now() - sessionStartRef.current) / 1000)),
        1000
      );
    }
    return () => clearInterval(timerRef.current);
  }, [phase]);

  // Auto-scroll messages
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  // STT callbacks
  const handleSTTResult = useCallback((text) => {
    setTranscript(text);
    transcriptRef.current = text;
  }, []);

  const handleSTTEnd = useCallback(() => {
    const finalTranscript = transcriptRef.current.trim();
    setTranscript("");
    transcriptRef.current = "";

    if (finalTranscript) {
      processUserInput(finalTranscript);
    } else {
      setStatus("idle");
    }
  }, []);
  const handleSTTError = useCallback((e) => {
    setError(`Microphone error: ${e}. Please allow microphone access.`);
    setStatus("idle");
  }, []);

  const { start: startListening, stop: stopListening } = useSTT({
    onResult: handleSTTResult,
    onEnd: handleSTTEnd,
    onError: handleSTTError,
  });

  // ── Process user speech input ──
  const processUserInput = async (text) => {
    setStatus("processing");

    const userMsg = { role: "user", content: text };
    conversationRef.current = [...conversationRef.current, userMsg];
    const msgId = Date.now();

    setMessages((prev) => [
      ...prev,
      { id: msgId, role: "user", content: text },
      { id: msgId + 1, role: "assistant", content: "", streaming: true },
    ]);

    const scenario = scenarioRef.current;
    if (!scenario) {
      setError("No scenario selected.");
      setStatus("idle");
      return;
    }

    try {
      const { text: response, ttfb } = await callBackend(
        conversationRef.current,
        scenario.systemPrompt,
        scenario.id,
        (_, full) => {
          setMessages((prev) =>
            prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: full, streaming: true } : m))
          );
        }
      );

      setLastLatency(ttfb);
      conversationRef.current = [
        ...conversationRef.current,
        { role: "assistant", content: response },
      ];
      setMessages((prev) =>
        prev.map((m, i) => (i === prev.length - 1 ? { ...m, content: response, streaming: false } : m))
      );
      setStatus("speaking");
      speak(response, () => setStatus("idle"));
    } catch (e) {
      setError(e.message || "Failed to get response.");
      setMessages((prev) => prev.filter((m) => !m.streaming));
      setStatus("idle");
    }
  };

  // ── Start a conversation scenario ──
  const startConversation = async (scenario) => {
    setSelectedScenario(scenario);
    setMessages([]);
    setStatus("processing");
    conversationRef.current = [];
    setPhase("conversation");
    setSessionTime(0);
    setError(null);

    const opener = [{ role: "user", content: "Begin the conversation." }];

    try {
      const { text: response, ttfb } = await callBackend(
        opener,
        scenario.systemPrompt,
        scenario.id,
        (_, full) => setMessages([{ id: 1, role: "assistant", content: full, streaming: true }])
      );
      setLastLatency(ttfb);
      conversationRef.current = [...opener, { role: "assistant", content: response }];
      setMessages([{ id: 1, role: "assistant", content: response, streaming: false }]);
      setStatus("speaking");
      speak(response, () => setStatus("idle"));
    } catch (e) {
      setError(e.message || "Failed to connect to backend. Is the server running?");
      setPhase("select");
      setStatus("idle");
    }
  };

  // ── Mic button handler with barge-in support ──
  const handleMicToggle = () => {
    if (status === "speaking") {
      // Barge-in: interrupt agent
      stopSpeaking();
      setStatus("listening");
      setTranscript("");
      startListening();
      return;
    }
    if (status === "listening") {
      stopListening();
      return;
    }
    if (status === "idle") {
      setStatus("listening");
      setTranscript("");
      startListening();
    }
  };

  // ── End call ──
  const endConversation = () => {
    stopSpeaking();
    stopListening();
    clearInterval(timerRef.current);
    setPhase("select");
    setStatus("idle");
    setMessages([]);
    conversationRef.current = [];
    setTranscript("");
    setSessionTime(0);
    setError(null);
  };

  const micDisabled = status === "processing";
  const micActive = status === "listening";
  const scenario = selectedScenario;

  // ── Render ──
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,700;0,9..40,900&display=swap');

        * { box-sizing: border-box; margin: 0; padding: 0; }
        html, body { height: 100%; background: #080B14; }

        @keyframes waveAnim {
          from { transform: scaleY(0.3); }
          to   { transform: scaleY(1); }
        }
        @keyframes blinkCursor {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes pulseRing {
          0%   { transform: scale(1); opacity: 0.7; }
          100% { transform: scale(1.7); opacity: 0; }
        }
        @keyframes spinAnim {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }

        ::-webkit-scrollbar { width: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 2px; }
      `}</style>

      <div
        style={{
          minHeight: "100vh",
          background: "linear-gradient(135deg, #080B14 0%, #0D1220 50%, #080B14 100%)",
          fontFamily: "'DM Sans', sans-serif",
          color: "#fff",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* ── Header ── */}
        <header
          style={{
            padding: "16px 28px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            background: "rgba(8,11,20,0.9)",
            backdropFilter: "blur(20px)",
            position: "sticky",
            top: 0,
            zIndex: 100,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "11px" }}>
            <div
              style={{
                width: "34px",
                height: "34px",
                borderRadius: "10px",
                background: "linear-gradient(135deg, #00D4AA, #7C6AF7)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "17px",
              }}
            >
              🎙
            </div>
            <div>
              <div style={{ fontWeight: 900, fontSize: "15px", letterSpacing: "-0.4px" }}>
                VoiceAgent
              </div>
              <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.35)", fontFamily: "monospace" }}>
                AI-Powered Conversations
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "20px" }}>
            {phase === "conversation" && (
              <>
                <StatsBar
                  latency={lastLatency}
                  turns={Math.floor(conversationRef.current.length / 2)}
                  sessionTime={sessionTime}
                />
                <button
                  onClick={endConversation}
                  style={{
                    background: "rgba(255,80,80,0.12)",
                    border: "1px solid rgba(255,80,80,0.28)",
                    borderRadius: "8px",
                    color: "#FF6B6B",
                    padding: "6px 16px",
                    cursor: "pointer",
                    fontSize: "12px",
                    fontFamily: "'DM Sans', sans-serif",
                    fontWeight: 600,
                  }}
                >
                  End Call
                </button>
              </>
            )}
            <BackendStatus />
          </div>
        </header>

        {/* ── Main ── */}
        <main style={{ flex: 1, display: "flex", flexDirection: "column" }}>

          {/* ── Permission Phase ── */}
          {phase === "permission" && (
            <MicPermissionScreen
              micState={micState}
              onRequest={async () => {
                const granted = await requestMic();
                if (granted) setPhase("select");
              }}
              onContinue={() => setPhase("select")}
            />
          )}

          {/* ── Select Phase ── */}
          {phase === "select" && (
            <div
              style={{
                maxWidth: "720px",
                margin: "0 auto",
                padding: "56px 24px",
                width: "100%",
                animation: "fadeSlideIn 0.45s ease",
              }}
            >
              <div style={{ textAlign: "center", marginBottom: "48px" }}>
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                    background: "rgba(0,212,170,0.08)",
                    border: "1px solid rgba(0,212,170,0.2)",
                    borderRadius: "100px",
                    padding: "4px 16px",
                    fontSize: "11px",
                    color: "#00D4AA",
                    fontFamily: "monospace",
                    marginBottom: "22px",
                    letterSpacing: "0.5px",
                  }}
                >
                  <span
                    style={{
                      width: "6px",
                      height: "6px",
                      borderRadius: "50%",
                      background: "#00D4AA",
                      display: "inline-block",
                      animation: "blinkCursor 2s ease infinite",
                    }}
                  />
                  NO SIGNUP REQUIRED
                </div>
                <h1
                  style={{
                    fontSize: "clamp(34px, 6vw, 54px)",
                    fontWeight: 900,
                    letterSpacing: "-2px",
                    lineHeight: "1.1",
                    marginBottom: "14px",
                    background: "linear-gradient(135deg, #fff 0%, rgba(255,255,255,0.5) 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                  }}
                >
                  Talk to an
                  <br />
                  AI Agent
                </h1>
                <p style={{ color: "rgba(255,255,255,0.42)", fontSize: "15px", lineHeight: "1.7" }}>
                  Select a scenario and speak naturally.
                  <br />
                  The agent maintains full context throughout your session.
                </p>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                  gap: "14px",
                  marginBottom: "36px",
                }}
              >
                {SCENARIOS.map((s) => (
                  <ScenarioCard key={s.id} scenario={s} onClick={() => startConversation(s)} />
                ))}
              </div>

              {/* Architecture pill */}
              <div
                style={{
                  background: "rgba(255,255,255,0.025)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  borderRadius: "14px",
                  padding: "20px 24px",
                }}
              >
                <div
                  style={{
                    fontSize: "10px",
                    color: "rgba(255,255,255,0.28)",
                    fontFamily: "monospace",
                    letterSpacing: "1px",
                    marginBottom: "14px",
                  }}
                >
                  ARCHITECTURE
                </div>
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: "6px",
                    fontSize: "12px",
                    color: "rgba(255,255,255,0.5)",
                  }}
                >
                  {[
                    ["🎤 Browser STT", "#00D4AA"],
                    ["→", null],
                    ["🖥 Express Backend", "#7C6AF7"],
                    ["→", null],
                    ["🤖 Groq API", "#FF6B6B"],
                    ["→", null],
                    ["🔊 Browser TTS", "#00D4AA"],
                  ].map(([label, color], i) => (
                    <span
                      key={i}
                      style={{
                        color: color || "rgba(255,255,255,0.25)",
                        fontFamily: color ? "monospace" : "inherit",
                        fontSize: color ? "11px" : "14px",
                      }}
                    >
                      {label}
                    </span>
                  ))}
                </div>
                <div
                  style={{
                    marginTop: "10px",
                    fontSize: "11px",
                    color: "rgba(255,255,255,0.3)",
                    lineHeight: "1.5",
                  }}
                >
                  API key lives securely on the Express server — never exposed to the browser.
                </div>
              </div>
            </div>
          )}

          {/* ── Conversation Phase ── */}
          {phase === "conversation" && scenario && (
            <div
              style={{
                maxWidth: "720px",
                margin: "0 auto",
                width: "100%",
                padding: "0 16px",
                display: "flex",
                flexDirection: "column",
                height: "calc(100vh - 69px)",
                animation: "fadeSlideIn 0.35s ease",
              }}
            >
              {/* Scenario header bar */}
              <div
                style={{
                  padding: "14px 0 12px",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  borderBottom: `1px solid ${scenario.color}20`,
                  flexShrink: 0,
                }}
              >
                <div
                  style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "12px",
                    background: `${scenario.color}18`,
                    border: `1.5px solid ${scenario.color}40`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "20px",
                  }}
                >
                  {scenario.icon}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: "14px", color: scenario.color }}>
                    {scenario.label}
                  </div>
                  <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.38)" }}>
                    {scenario.description}
                  </div>
                </div>
                <Waveform active={status === "speaking"} color={scenario.color} bars={14} />
              </div>

              {/* Messages */}
              <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "18px 0" }}>
                {messages.map((msg) => (
                  <MessageBubble key={msg.id} msg={msg} color={scenario.color} />
                ))}

                {/* Thinking indicator */}
                {status === "processing" && messages.length > 0 && !messages[messages.length - 1].streaming && (
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
                    <div
                      style={{
                        width: "32px",
                        height: "32px",
                        borderRadius: "50%",
                        background: scenario.color,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "14px",
                        flexShrink: 0,
                      }}
                    >
                      🤖
                    </div>
                    <div
                      style={{
                        padding: "10px 16px",
                        borderRadius: "18px 18px 18px 4px",
                        background: `${scenario.color}20`,
                        border: `1px solid ${scenario.color}40`,
                        display: "flex",
                        gap: "4px",
                        alignItems: "center",
                      }}
                    >
                      {[0, 0.2, 0.4].map((d, i) => (
                        <div
                          key={i}
                          style={{
                            width: "6px",
                            height: "6px",
                            borderRadius: "50%",
                            background: scenario.color,
                            animation: `blinkCursor 1s ease ${d}s infinite`,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Error banner */}
              {error && (
                <div
                  style={{
                    background: "rgba(255,80,80,0.08)",
                    border: "1px solid rgba(255,80,80,0.25)",
                    borderRadius: "10px",
                    padding: "10px 16px",
                    color: "#FF8080",
                    fontSize: "13px",
                    marginBottom: "10px",
                    flexShrink: 0,
                  }}
                >
                  ⚠️ {error}
                </div>
              )}

              {/* Live transcript */}
              {transcript && (
                <div
                  style={{
                    background: "rgba(255,255,255,0.04)",
                    borderRadius: "10px",
                    padding: "9px 14px",
                    marginBottom: "10px",
                    fontSize: "13px",
                    color: "rgba(255,255,255,0.55)",
                    fontStyle: "italic",
                    flexShrink: 0,
                    border: "1px solid rgba(255,255,255,0.07)",
                  }}
                >
                  {transcript}
                </div>
              )}

              {/* Controls */}
              <div
                style={{
                  padding: "14px 0 22px",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "10px",
                  flexShrink: 0,
                }}
              >
                {/* Status label */}
                <div
                  style={{
                    fontSize: "11px",
                    color:
                      status === "listening"
                        ? "#4CAF50"
                        : status === "speaking"
                          ? scenario.color
                          : status === "processing"
                            ? "#FFB74D"
                            : "rgba(255,255,255,0.28)",
                    fontFamily: "monospace",
                    letterSpacing: "0.8px",
                    transition: "color 0.3s ease",
                  }}
                >
                  {status === "idle" && "TAP MIC TO SPEAK"}
                  {status === "listening" && "● LISTENING…"}
                  {status === "processing" && "◌ PROCESSING…"}
                  {status === "speaking" && "▶ SPEAKING — TAP TO INTERRUPT"}
                </div>

                {/* Mic button */}
                <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {(micActive || isSpeaking) &&
                    [1, 2].map((i) => (
                      <div
                        key={i}
                        style={{
                          position: "absolute",
                          width: "70px",
                          height: "70px",
                          borderRadius: "50%",
                          border: `2px solid ${micActive ? "#4CAF50" : scenario.color}`,
                          animation: `pulseRing 1.6s ease-out ${i * 0.55}s infinite`,
                          pointerEvents: "none",
                        }}
                      />
                    ))}

                  <button
                    onClick={handleMicToggle}
                    disabled={micDisabled}
                    aria-label={micActive ? "Stop listening" : "Start speaking"}
                    style={{
                      width: "70px",
                      height: "70px",
                      borderRadius: "50%",
                      border: "none",
                      background: micActive
                        ? "#4CAF50"
                        : isSpeaking
                          ? scenario.color
                          : micDisabled
                            ? "rgba(255,255,255,0.06)"
                            : "rgba(255,255,255,0.1)",
                      cursor: micDisabled ? "not-allowed" : "pointer",
                      fontSize: "26px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "all 0.22s ease",
                      transform: micActive ? "scale(1.08)" : "scale(1)",
                      boxShadow: micActive
                        ? "0 0 28px rgba(76,175,80,0.45)"
                        : isSpeaking
                          ? `0 0 28px ${scenario.color}50`
                          : "none",
                      outline: "none",
                    }}
                  >
                    {micDisabled ? (
                      <div
                        style={{
                          width: "22px",
                          height: "22px",
                          border: "2px solid rgba(255,255,255,0.2)",
                          borderTopColor: "rgba(255,255,255,0.7)",
                          borderRadius: "50%",
                          animation: "spinAnim 0.8s linear infinite",
                        }}
                      />
                    ) : micActive ? (
                      "⏹"
                    ) : isSpeaking ? (
                      "🤚"
                    ) : (
                      "🎤"
                    )}
                  </button>
                </div>

                <div
                  style={{
                    fontSize: "10px",
                    color: "rgba(255,255,255,0.18)",
                    textAlign: "center",
                    fontFamily: "monospace",
                  }}
                >
                  {isSpeaking
                    ? "Tap 🤚 to barge in and interrupt"
                    : micActive
                      ? "Tap ⏹ when done speaking"
                      : "Powered by Groq · Proxied via Express"}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
