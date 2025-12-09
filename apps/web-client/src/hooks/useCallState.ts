import { useState, useEffect, useCallback } from 'react';
import { useSocket } from './useSocket';
import type { CallStateUpdate, CopilotSuggestion, TranscriptEntry } from 'shared-types';

export interface CallState {
  callId: string | null;
  status: 'idle' | 'ringing' | 'active' | 'ended';
  activeSpeaker: 'AI' | 'HUMAN' | 'CUSTOMER' | null;
  mode: 'AI_AGENT' | 'HUMAN_REP';
  customerId: string | null;
  startTime: number | null;
  switchCount: number;
}

const initialCallState: CallState = {
  callId: null,
  status: 'idle',
  activeSpeaker: null,
  mode: 'AI_AGENT',
  customerId: null,
  startTime: null,
  switchCount: 0,
};

export function useCallState() {
  const { on, off, emit } = useSocket();
  const [callState, setCallState] = useState<CallState>(initialCallState);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [suggestions, setSuggestions] = useState<CopilotSuggestion[]>([]);

  // Handle incoming socket events
  useEffect(() => {
    const handleStateUpdate = (data: unknown) => {
      const update = data as CallStateUpdate;
      setCallState((prev) => ({
        ...prev,
        callId: update.callId,
        status: 'active',
        activeSpeaker: update.activeSpeaker,
        mode: update.isMuted ? 'HUMAN_REP' : 'AI_AGENT',
      }));
    };

    const handleTranscriptUpdate = (data: unknown) => {
      const entry = data as TranscriptEntry;
      setTranscript((prev) => [...prev, entry]);
    };

    const handleSuggestion = (data: unknown) => {
      const suggestion = data as CopilotSuggestion;
      setSuggestions((prev) => [...prev, suggestion]);
    };

    const handleSwitch = (data: unknown) => {
      const { direction } = data as { direction: string };
      setCallState((prev) => ({
        ...prev,
        mode: direction === 'AI_TO_HUMAN' ? 'HUMAN_REP' : 'AI_AGENT',
        switchCount: prev.switchCount + 1,
      }));
    };

    const handleCallEnd = () => {
      setCallState((prev) => ({ ...prev, status: 'ended' }));
    };

    // Subscribe to events
    on('call:state_update', handleStateUpdate);
    on('transcript:update', handleTranscriptUpdate);
    on('copilot:suggestion', handleSuggestion);
    on('call:switch', handleSwitch);
    on('call:end', handleCallEnd);

    // Cleanup
    return () => {
      off('call:state_update', handleStateUpdate);
      off('transcript:update', handleTranscriptUpdate);
      off('copilot:suggestion', handleSuggestion);
      off('call:switch', handleSwitch);
      off('call:end', handleCallEnd);
    };
  }, [on, off]);

  // Actions
  const joinCall = useCallback((callId: string) => {
    emit('call:join', callId);
    setCallState((prev) => ({ ...prev, callId, status: 'active', startTime: Date.now() }));
  }, [emit]);

  const leaveCall = useCallback(() => {
    if (callState.callId) {
      emit('call:leave', callState.callId);
    }
    setCallState(initialCallState);
    setTranscript([]);
    setSuggestions([]);
  }, [emit, callState.callId]);

  const requestSwitch = useCallback((direction: 'AI_TO_HUMAN' | 'HUMAN_TO_AI') => {
    if (callState.callId) {
      emit('call:request_switch', { callId: callState.callId, direction });
    }
  }, [emit, callState.callId]);

  const clearSuggestion = useCallback((index: number) => {
    setSuggestions((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return {
    callState,
    transcript,
    suggestions,
    joinCall,
    leaveCall,
    requestSwitch,
    clearSuggestion,
  };
}

