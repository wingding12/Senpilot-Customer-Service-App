import { useState, useRef, useCallback, useEffect } from "react";
import { RetellWebClient } from "retell-client-js-sdk";
import styles from "./CallButton.module.css";

type CallStatus = "idle" | "connecting" | "active" | "ended" | "error";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3001";

export default function CallButton() {
  const [status, setStatus] = useState<CallStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [transcript, setTranscript] = useState<
    Array<{ role: string; content: string }>
  >([]);

  const retellClientRef = useRef<RetellWebClient | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  // Initialize Retell client on mount
  useEffect(() => {
    retellClientRef.current = new RetellWebClient();

    // Set up event listeners
    const client = retellClientRef.current;

    client.on("call_started", () => {
      console.log("✅ Retell call started");
      setStatus("active");
      setError(null);
    });

    client.on("call_ended", () => {
      console.log("📞 Retell call ended");
      setStatus("ended");
      setTimeout(() => setStatus("idle"), 2000);
    });

    client.on("error", (err) => {
      console.error("❌ Retell error:", err);
      setError(err.message || "Call failed");
      setStatus("error");
      setTimeout(() => {
        setStatus("idle");
        setError(null);
      }, 3000);
    });

    client.on("update", (update) => {
      // Handle transcript updates
      if (update.transcript) {
        setTranscript(update.transcript);
      }
    });

    return () => {
      // Cleanup on unmount
      if (retellClientRef.current) {
        retellClientRef.current.stopCall();
      }
    };
  }, []);

  const startCall = useCallback(async () => {
    if (!retellClientRef.current) {
      setError("Call client not initialized");
      return;
    }

    setStatus("connecting");
    setError(null);
    setTranscript([]);

    try {
      // Request microphone permission first
      await navigator.mediaDevices.getUserMedia({ audio: true });

      // Create web call via backend
      const response = await fetch(`${API_URL}/api/voice/web-call`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.message || errorData.error || "Failed to create call"
        );
      }

      const data = await response.json();
      console.log("📞 Web call created:", data);

      sessionIdRef.current = data.sessionId;

      // Start the Retell call with the access token
      await retellClientRef.current.startCall({
        accessToken: data.accessToken,
      });
    } catch (err) {
      console.error("❌ Failed to start call:", err);
      setError(err instanceof Error ? err.message : "Failed to start call");
      setStatus("error");
      setTimeout(() => {
        setStatus("idle");
        setError(null);
      }, 3000);
    }
  }, []);

  const endCall = useCallback(() => {
    if (retellClientRef.current) {
      retellClientRef.current.stopCall();
    }
    setStatus("ended");
    setTimeout(() => setStatus("idle"), 2000);
  }, []);

  const toggleMute = useCallback(() => {
    if (retellClientRef.current && status === "active") {
      if (isMuted) {
        retellClientRef.current.unmute();
      } else {
        retellClientRef.current.mute();
      }
      setIsMuted(!isMuted);
    }
  }, [isMuted, status]);

  const handleCall = async () => {
    if (status === "idle") {
      await startCall();
    } else if (status === "active") {
      endCall();
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.visualization}>
        <div
          className={`${styles.rings} ${
            status === "active" ? styles.active : ""
          }`}
        >
          <span></span>
          <span></span>
          <span></span>
        </div>

        <button
          className={`${styles.callButton} ${styles[status]}`}
          onClick={handleCall}
          disabled={status === "connecting" || status === "ended"}
        >
          {status === "idle" && "📞"}
          {status === "connecting" && "⏳"}
          {status === "active" && "📴"}
          {status === "ended" && "✓"}
          {status === "error" && "❌"}
        </button>
      </div>

      <div className={styles.statusText}>
        {status === "idle" && "Tap to start voice call"}
        {status === "connecting" && "Connecting to AI agent..."}
        {status === "active" && "Speaking with AI Agent - Tap to end"}
        {status === "ended" && "Call ended"}
        {status === "error" && (error || "Connection failed")}
      </div>

      {status === "active" && (
        <div className={styles.controls}>
          <button
            className={`${styles.controlButton} ${
              isMuted ? styles.active : ""
            }`}
            onClick={toggleMute}
          >
            {isMuted ? "🔇 Unmute" : "🎙️ Mute"}
          </button>
          <button className={styles.controlButton} onClick={endCall}>
            📞 End Call
          </button>
        </div>
      )}

      {/* Live transcript preview */}
      {status === "active" && transcript.length > 0 && (
        <div className={styles.transcriptPreview}>
          {transcript.slice(-2).map((entry, i) => (
            <div key={i} className={styles.transcriptEntry}>
              <span className={styles.role}>
                {entry.role === "agent" ? "🤖" : "👤"}
              </span>
              <span className={styles.content}>{entry.content}</span>
            </div>
          ))}
        </div>
      )}

      <div className={styles.hint}>
        Say "speak to a human" during the call to transfer
      </div>
    </div>
  );
}
