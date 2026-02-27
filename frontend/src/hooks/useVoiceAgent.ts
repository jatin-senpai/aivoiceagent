'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

export function useVoiceAgent() {
    const [isConnected, setIsConnected] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [sessionId, setSessionId] = useState<string>('');
    const [transcript, setTranscript] = useState('');
    const [userTranscript, setUserTranscript] = useState('');
    const [debugLog, setDebugLog] = useState<string>('');
    const [error, setError] = useState<string | null>(null);

    const recognitionRef = useRef<any>(null);
    const synthRef = useRef<any>(null);
    const micStreamRef = useRef<MediaStream | null>(null);

    // Refs to avoid stale closures in event handlers
    const isConnectedRef = useRef(false);
    const isSpeakingRef = useRef(false);
    const isProcessingRef = useRef(false);

    const log = (msg: string) => {
        console.log(`[AGENT] ${msg}`);
        setDebugLog(prev => {
            const lines = prev.split('\n');
            return `${new Date().toLocaleTimeString()}: ${msg}\n${lines.slice(0, 2).join('\n')}`;
        });
    };

    // Initialize session ID
    useEffect(() => {
        setSessionId(Math.random().toString(36).substring(7));
    }, []);

    const stopSession = useCallback(() => {
        log('Stopping session...');
        if (recognitionRef.current) {
            recognitionRef.current.onend = null;
            recognitionRef.current.onerror = null;
            recognitionRef.current.onresult = null;
            try { recognitionRef.current.stop(); } catch (e) { }
            recognitionRef.current = null;
        }
        if (micStreamRef.current) {
            micStreamRef.current.getTracks().forEach(t => t.stop());
            micStreamRef.current = null;
        }
        if (synthRef.current) {
            synthRef.current.cancel();
        }

        isConnectedRef.current = false;
        isSpeakingRef.current = false;
        isProcessingRef.current = false;
        setIsConnected(false);
        setIsListening(false);
        setIsSpeaking(false);
        setIsProcessing(false);
        setTranscript('');
        setUserTranscript('');
    }, []);

    const speak = useCallback((text: string) => {
        if (!synthRef.current) return;

        synthRef.current.cancel();
        const utterance = new SpeechSynthesisUtterance(text);

        utterance.onstart = () => {
            log('Agent speaking...');
            isSpeakingRef.current = true;
            setIsSpeaking(true);
            setIsListening(false);
        };

        utterance.onend = () => {
            log('Agent done.');
            isSpeakingRef.current = false;
            setIsSpeaking(false);

            // Re-start recognition if still connected and not processing/speaking
            if (isConnectedRef.current && recognitionRef.current && !isProcessingRef.current) {
                try {
                    log('Opening Mic...');
                    recognitionRef.current.start();
                } catch (e: any) {
                    console.warn('Recognition start skipped:', e.message);
                }
            }
        };

        utterance.onerror = (e) => {
            console.error('TTS Error:', e);
            isSpeakingRef.current = false;
            setIsSpeaking(false);
        };

        const voices = synthRef.current.getVoices();
        const preferredVoice = voices.find((v: any) => v.name.includes('Google') || v.name.includes('Female')) || voices[0];
        if (preferredVoice) utterance.voice = preferredVoice;

        synthRef.current.speak(utterance);
    }, [log]);

    const handleChat = useCallback(async (scenarioId: string, message: string) => {
        try {
            if (isProcessingRef.current) return;

            log(`Processing: "${message}"`);
            setIsProcessing(true);
            isProcessingRef.current = true;

            // Stop recognition while processing
            if (recognitionRef.current) {
                try { recognitionRef.current.stop(); } catch (e) { }
            }

            const response = await fetch('http://localhost:3001/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ scenarioId, message, sessionId })
            });

            if (!response.ok) throw new Error('Failed to get response');
            const data = await response.json();

            setTranscript(data.reply);
            setIsProcessing(false);
            isProcessingRef.current = false;
            speak(data.reply);
        } catch (err: any) {
            console.error('Chat error:', err);
            setError(err.message);
            setIsProcessing(false);
            isProcessingRef.current = false;
        }
    }, [speak, sessionId]);

    const startSession = useCallback(async (scenarioId: string) => {
        try {
            setError(null);
            isConnectedRef.current = true;
            setIsConnected(true);
            setSessionId(Math.random().toString(36).substring(7));
            setTranscript('');
            setUserTranscript('');
            log('Waking up Microphone...');

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            micStreamRef.current = stream;

            const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
            if (!SpeechRecognition) {
                throw new Error('Web Speech API not supported in this browser.');
            }

            const recognition = new SpeechRecognition();
            recognition.continuous = false;
            recognition.interimResults = true;
            recognition.lang = 'en-US';

            recognition.onstart = () => {
                log('Listening...');
                setIsListening(true);
            };

            recognition.onend = () => {
                setIsListening(false);
                // Auto-restart if connected and not speaking
                if (isConnectedRef.current && !isSpeakingRef.current) {
                    setTimeout(() => {
                        if (isConnectedRef.current && !isSpeakingRef.current) {
                            try { recognition.start(); } catch (e) { }
                        }
                    }, 200);
                }
            };

            recognition.onspeechstart = () => {
                log('Microphone detecting sound...');
            };

            recognition.onresult = (event: any) => {
                let interim = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        const finalMsg = event.results[i][0].transcript;
                        log(`You said: "${finalMsg}"`);
                        setUserTranscript(finalMsg);
                        handleChat(scenarioId, finalMsg);
                    } else {
                        interim += event.results[i][0].transcript;
                        setUserTranscript(interim);
                    }
                }
            };

            recognition.onerror = (event: any) => {
                console.error('STT Error Event:', event.error);
                if (event.error === 'not-allowed') {
                    setError('Microphone access denied. Please allow in your browser.');
                } else if (event.error !== 'no-speech') {
                    setError(`Microphone error: ${event.error}`);
                }
            };

            recognitionRef.current = recognition;
            synthRef.current = window.speechSynthesis;

            // Initial Greeting
            const welcomeMsg = "Hello! I am ready to help. How can I assist you today?";
            setTranscript(welcomeMsg);
            speak(welcomeMsg);

        } catch (err: any) {
            console.error('Session initialization error:', err);
            setError(err.message);
            stopSession();
        }
    }, [handleChat, speak, stopSession, isConnected]);

    useEffect(() => {
        return () => stopSession();
    }, [stopSession]);

    return {
        startSession,
        stopSession,
        isConnected,
        isListening,
        isSpeaking,
        isProcessing,
        transcript,
        userTranscript,
        debugLog,
        error,
    };
}
