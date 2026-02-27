'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

export function useRealtime() {
    const [isConnected, setIsConnected] = useState(false);
    const [isListening, setIsListening] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [userTranscript, setUserTranscript] = useState('');
    const [error, setError] = useState<string | null>(null);

    const pcRef = useRef<RTCPeerConnection | null>(null);
    const dcRef = useRef<RTCDataChannel | null>(null);

    const stopSession = useCallback(() => {
        if (pcRef.current) {
            pcRef.current.close();
            pcRef.current = null;
        }
        dcRef.current = null;
        setIsConnected(false);
        setIsListening(false);
        setIsSpeaking(false);
        console.log('Session stopped');
    }, []);

    const startSession = useCallback(async (scenarioId: string, audioEl: HTMLAudioElement) => {
        try {
            setError(null);
            console.log('Starting session for scenario:', scenarioId);

            // 1. Get ephemeral token from our backend
            const tokenResponse = await fetch(`http://localhost:3001/session?scenarioId=${scenarioId}`);
            if (!tokenResponse.ok) {
                const errText = await tokenResponse.text();
                throw new Error(`Failed to get session token: ${errText}`);
            }
            const data = await tokenResponse.json();
            const { client_secret } = data;
            console.log('Token received');

            // 2. Create PeerConnection
            const pc = new RTCPeerConnection();
            pcRef.current = pc;

            pc.ontrack = (e) => {
                console.log('Received remote track:', e.track.kind);
                audioEl.srcObject = e.streams[0];
                audioEl.play().catch(pErr => console.error('Autoplay blocked or failed:', pErr));
                console.log('Remote stream attached and play() called');
            };

            // 3. Add local microphone track
            const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
            ms.getTracks().forEach(track => pc.addTrack(track, ms));
            console.log('Local tracks added');

            // 4. Data channel for events
            const dc = pc.createDataChannel('oai-events');
            dcRef.current = dc;

            dc.onopen = () => {
                setIsConnected(true);
                setIsListening(true);
                console.log('Data channel open');

                // 1. Send session update
                const updateEvent = {
                    type: 'session.update',
                    session: {
                        input_audio_transcription: { model: 'whisper-1' },
                        turn_detection: { type: 'server_vad' }
                    }
                };
                dc.send(JSON.stringify(updateEvent));

                // 2. Create a conversation item for the agent to respond to
                const itemEvent = {
                    type: 'conversation.item.create',
                    item: {
                        type: 'message',
                        role: 'user',
                        content: [
                            {
                                type: 'input_text',
                                text: 'Hi! Please introduce yourself and start our session.'
                            }
                        ]
                    }
                };
                dc.send(JSON.stringify(itemEvent));

                // 3. Request a response
                const triggerEvent = {
                    type: 'response.create',
                    response: {
                        modalities: ['audio', 'text'],
                    }
                };
                dc.send(JSON.stringify(triggerEvent));
                console.log('Forced initial greeting sent');
            };

            dc.onmessage = (e) => {
                const event = JSON.parse(e.data);
                // Log all types for debugging
                if (event.type !== 'input_audio_buffer.append') {
                    console.log('[OPENAI EVENT]', event.type, event);
                }

                if (event.type === 'response.audio.delta') {
                    setIsSpeaking(true);
                }
                if (event.type === 'conversation.item.input_audio_transcription.completed') {
                    console.log('USER SAID:', event.transcript);
                    setUserTranscript(event.transcript);
                }
                if (event.type === 'response.audio_transcript.done') {
                    console.log('AGENT SAID:', event.transcript);
                    setTranscript(event.transcript);
                }
                if (event.type === 'response.audio_transcript.delta') {
                    setTranscript(prev => prev + event.delta);
                }
                if (event.type === 'response.create') {
                    setTranscript(''); // Clear on new response
                }
                if (event.type === 'error') {
                    console.error('OpenAI Error:', event.error);
                    setError(event.error.message);
                }
            };

            // 5. SDP Handshake
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            const baseUrl = 'https://api.openai.com/v1/realtime';
            const model = 'gpt-4o-realtime-preview-2024-12-17';
            const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
                method: 'POST',
                body: offer.sdp,
                headers: {
                    Authorization: `Bearer ${client_secret.value}`,
                    'Content-Type': 'application/sdp',
                },
            });

            if (!sdpResponse.ok) {
                const errText = await sdpResponse.text();
                throw new Error(`SDP handshake failed: ${errText}`);
            }

            const sdpAnswer = await sdpResponse.text();
            const answer = {
                type: 'answer' as RTCSdpType,
                sdp: sdpAnswer,
            };
            await pc.setRemoteDescription(answer);
            console.log('Handshake complete');

        } catch (err: any) {
            console.error('Session error:', err);
            setError(err.message);
            stopSession();
        }
    }, [stopSession]);

    // Cleanup on unmount
    useEffect(() => {
        return () => stopSession();
    }, [stopSession]);

    return {
        startSession,
        stopSession,
        isConnected,
        isListening,
        isSpeaking,
        transcript,
        userTranscript,
        error,
    };
}
