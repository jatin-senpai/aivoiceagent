'use client';

import { useState, useRef } from 'react';
import { useVoiceAgent } from '@/hooks/useVoiceAgent';
import ScenarioCard from '@/components/ScenarioCard';

const SCENARIOS = [
  {
    id: 'calling_agent',
    name: 'Calling Agent',
    icon: '📞',
    description: 'Dental clinic assistant for appointment scheduling.'
  },
  {
    id: 'customer_support',
    name: 'Customer Support',
    icon: '🎧',
    description: 'Dr. Code Store rep for order inquiries and resolutions.'
  },
  {
    id: 'technical_assistant',
    name: 'Technical Assistant',
    icon: '💻',
    description: 'CSS expert for step-by-step layout troubleshooting.'
  }
];

export default function Home() {
  const [selectedScenario, setSelectedScenario] = useState(SCENARIOS[0].id);
  const audioRef = useRef<HTMLAudioElement>(null);
  const { startSession, stopSession, isConnected, isListening, isSpeaking, isProcessing, transcript, userTranscript, debugLog, error } = useVoiceAgent();

  const handleToggle = () => {
    if (isConnected) {
      stopSession();
    } else {
      startSession(selectedScenario);
    }
  };

  return (
    <main className="min-h-screen py-12 px-6 md:px-24 flex flex-col items-center">
      <div className="max-w-5xl w-full flex flex-col gap-16">

        {/* Header Section */}
        <div className="text-center flex flex-col gap-6 animate-float">
          <div className="inline-block px-4 py-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-400 text-sm font-semibold tracking-wide self-center">
            PORTFOLIO VOICE AI
          </div>
          <h1 className="text-6xl md:text-7xl font-black tracking-tight">
            <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              AI Voice Portal
            </span>
          </h1>
          <p className="text-slate-400 text-xl max-w-2xl mx-auto font-medium">
            Engage with professional AI personas in natural, real-time conversation.
          </p>
        </div>

        {/* Selection Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {SCENARIOS.map((s) => (
            <ScenarioCard
              key={s.id}
              {...s}
              isSelected={selectedScenario === s.id}
              onSelect={() => !isConnected && setSelectedScenario(s.id)}
            />
          ))}
        </div>

        {/* Interaction Hub */}
        <div className="glass-panel rounded-[40px] p-12 md:p-20 flex flex-col items-center gap-12 relative overflow-hidden">
          {/* Background Ambient Glow */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full opacity-20 pointer-events-none">
            <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full blur-[120px] transition-colors duration-700 ${isSpeaking ? 'bg-pink-500' : isListening ? 'bg-emerald-500' : isProcessing ? 'bg-indigo-500' : 'bg-slate-700'}`}></div>
          </div>

          <div className="relative z-10 flex flex-col items-center gap-10 w-full">
            {/* Status & Visualizer */}
            <div className="flex flex-col items-center gap-4 w-full">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-700'}`}></div>
                <span className={`text-sm font-bold tracking-widest uppercase transition-colors ${isConnected ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {isSpeaking ? 'AI Speaking' : isProcessing ? 'AI Thinking' : isListening ? 'Listening...' : isConnected ? 'Session Active' : 'System Ready'}
                </span>
              </div>

              <div className="min-h-[140px] flex flex-col items-center justify-center gap-6 w-full">
                {isProcessing ? (
                  <div className="flex flex-col items-center gap-4 animate-pulse">
                    <div className="flex gap-2">
                      <div className="w-3 h-3 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                      <div className="w-3 h-3 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                      <div className="w-3 h-3 bg-indigo-400 rounded-full animate-bounce"></div>
                    </div>
                    <div className="text-indigo-400 text-lg font-bold">Thinking...</div>
                  </div>
                ) : isSpeaking || transcript ? (
                  <div className="flex flex-col items-center gap-6 w-full">
                    <div className="wave-container h-12">
                      {[...Array(12)].map((_, i) => (
                        <div
                          key={i}
                          className={`wave-bar ${isSpeaking ? 'bg-pink-400' : 'bg-slate-600'}`}
                          style={{
                            height: isSpeaking ? `${20 + Math.random() * 40}px` : '4px',
                            animation: isSpeaking ? `wave 1.2s ease-in-out infinite ${i * 0.08}s` : 'none'
                          }}
                        />
                      ))}
                    </div>
                    {transcript && (
                      <div className="text-white text-center max-w-2xl text-xl font-medium leading-relaxed animate-in fade-in slide-in-from-bottom-4 duration-500">
                        {transcript}
                      </div>
                    )}
                  </div>
                ) : isListening ? (
                  <div className="flex flex-col items-center gap-6 w-full">
                    <div className="orb-glow bg-emerald-500/20 shadow-[0_0_50px_rgba(16,185,129,0.3)] border border-emerald-500/30">
                      <div className="w-full h-full bg-emerald-500/40 rounded-full animate-ping opacity-20"></div>
                    </div>
                    <div className="h-10 flex items-center justify-center">
                      {userTranscript ? (
                        <div className="text-emerald-400 text-lg font-medium italic transition-all duration-300">
                          "{userTranscript}"
                        </div>
                      ) : (
                        <div className="text-slate-500 text-sm animate-pulse tracking-wide font-semibold">WAITING FOR SPEECH</div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-slate-600 text-lg font-medium opacity-50 bg-slate-900/40 px-8 py-4 rounded-3xl border border-slate-800/50">Choose a scenario to begin</div>
                )}
              </div>

              {isConnected && (
                <div className="mt-8 opacity-40 hover:opacity-100 transition-opacity duration-300 w-full max-w-md">
                  <div className="text-[10px] text-slate-500 font-mono bg-black/40 p-3 rounded-xl border border-white/5 h-16 overflow-y-auto custom-scrollbar">
                    {debugLog || 'System logs ready...'}
                  </div>
                </div>
              )}
            </div>

            {/* Hidden Audio for Agent */}
            <audio ref={audioRef} autoPlay />

            {/* Main Action Button */}
            <button
              onClick={handleToggle}
              className={`group relative px-12 py-5 rounded-3xl font-bold text-2xl transition-all duration-300 transform active:scale-95 shadow-2xl
                ${isConnected
                  ? 'bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700'
                  : 'bg-indigo-600 text-white hover:bg-indigo-500 hover:shadow-indigo-500/25'
                }`}
            >
              <span className="relative z-10">
                {isConnected ? 'Stop Interaction' : 'Begin Conversation'}
              </span>
              {!isConnected && (
                <div className="absolute inset-0 rounded-3xl bg-indigo-400 opacity-0 group-hover:opacity-10 blur-xl transition-opacity"></div>
              )}
            </button>

            {error && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-6 py-3 rounded-2xl text-sm font-medium animate-bounce">
                ⚠️ {error}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="text-center text-slate-500 text-sm font-medium tracking-wide">
          POWERED BY <span className="text-slate-400 underline decoration-indigo-500/50 underline-offset-4">WEB SPEECH API</span> • NEXT.JS 15
        </div>
      </div>

      <style jsx>{`
        @keyframes wave {
          0%, 100% { transform: scaleY(0.4); }
          50% { transform: scaleY(1.2); }
        }
      `}</style>
    </main>
  );
}
