import React, { useState, useEffect, useRef } from "react";
import Lottie from "lottie-react";
import catAnimation from "../public/cat.json";

// 🔊 Voice alert
const speak = (text) => {
  try {
    const utter = new SpeechSynthesisUtterance(text);
    utter.pitch = 1;
    utter.rate = 1;
    speechSynthesis.speak(utter);
  } catch (e) {
    console.warn("Speech error:", e);
  }
};

export default function Assistant() {
  // PANEL + MODES
  const [mode, setMode] = useState("none");
  const [showPanel, setShowPanel] = useState(false);

  // CHAT
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [displayedText, setDisplayedText] = useState("");
  const [isThinking, setIsThinking] = useState(false);

  // PRODUCTIVITY + SESSION TRACKING
  const [currentApp, setCurrentApp] = useState("");
  const [usageSnapshot, setUsageSnapshot] = useState({});
  const [isTracking, setIsTracking] = useState(false);
  const [sessionData, setSessionData] = useState(null);

  // WEBSITE RISK SYSTEM
  const [currentURL, setCurrentURL] = useState("");
  const [scanResult, setScanResult] = useState(null);
  const [riskLevel, setRiskLevel] = useState("safe"); // safe | medium | high
  const [isScanning, setIsScanning] = useState(false);

  // WINDOW MOVEMENT
  const dragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const mouseDownPos = useRef({ x: 0, y: 0 });

  const lastSavedSessionStartRef = useRef(null);

  // =====================================================
  //      ELECTRON EVENT LISTENERS
  // =====================================================
  useEffect(() => {
    // ==== ACTIVE APP ====
    window.electronAPI?.onUsageUpdate?.(({ current, usage }) => {
      setCurrentApp(current);
      setUsageSnapshot({ ...usage });
    });

    window.electronAPI?.requestUsageSnapshot?.();
    window.electronAPI?.onUsageSnapshot?.(({ usage, current }) => {
      setUsageSnapshot({ ...usage });
      setCurrentApp(current);
    });

    // ==== SESSION TRACKING ====
    window.electronAPI?.onTrackingData?.((data) => {
      setSessionData(data);
      setIsTracking(Boolean(data?.trackingActive));

      // AUTO-SAVE SESSION
      if (data?.sessionEnd && data?.sessionStart) {
        const last = lastSavedSessionStartRef.current;

        if (!last || last !== data.sessionStart) {
          lastSavedSessionStartRef.current = data.sessionStart;

          fetch("http://localhost:5000/tracking-session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionStart: data.sessionStart,
              sessionEnd: data.sessionEnd,
              timeline: data.timeline || [],
            }),
          }).catch(() => {});
        }
      }
    });

    window.electronAPI?.requestTrackingData?.();

    // ==== ACTIVE WEBSITE URL ====
    window.electronAPI?.onURLUpdate?.(({ url }) => {
      setCurrentURL(url);

      if (url.startsWith("http")) triggerScan(url);
    });

    // ==== SCAN RESULT FROM BACKEND ====
    window.electronAPI?.onScanResult?.((result) => {
      console.log("🔥 Frontend received scan result:", result);

      setIsScanning(false);
      setScanResult(result || {});

      if (!result || result.error) {
        setRiskLevel("safe");
        return;
      }

      const verdict = result.verdict || "SAFE";
      const score = Number(result.riskScore || 0);

      if (verdict === "DANGEROUS") {
        setRiskLevel("high");
        speak("Warning. This website may be dangerous.");
      } else if (score >= 40) {
        setRiskLevel("medium");
      } else {
        setRiskLevel("safe");
      }
    });
  }, []);

  // =====================================================
  // SMOOTH CHAT TYPING
  // =====================================================
  useEffect(() => {
    if (!messages.length) {
      setDisplayedText("");
      return;
    }

    const full = messages[0].text;
    let i = 0;
    setDisplayedText("");

    const iv = setInterval(() => {
      i += 2;
      setDisplayedText(full.slice(0, i));

      if (i >= full.length) clearInterval(iv);
    }, 18);

    return () => clearInterval(iv);
  }, [messages]);

  // =====================================================
  // SEND CHAT MESSAGE
  // =====================================================
  const sendMessage = async () => {
    if (!input.trim() || isThinking) return;

    setIsThinking(true);

    const res = await fetch("http://localhost:5000/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: input }),
    });

    const data = await res.json();
    setMessages([{ role: "assistant", text: data.reply }]);
    setInput("");
    setIsThinking(false);
  };

  // =====================================================
  // WEBSITE SCAN TRIGGER
  // =====================================================
  const triggerScan = (url) => {
    if (!url) return;

    setIsScanning(true);
    setScanResult(null);
    setRiskLevel("safe");

    window.electronAPI?.scanURL?.(url);
  };

  // =====================================================
  // DRAGGING WINDOW
  // =====================================================
  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    dragging.current = true;
    lastPos.current = { x: e.screenX, y: e.screenY };
    mouseDownPos.current = { x: e.screenX, y: e.screenY };
  };

  const handleMouseUp = (e) => {
    dragging.current = false;

    const dx = e.screenX - mouseDownPos.current.x;
    const dy = e.screenY - mouseDownPos.current.y;

    if (dx * dx + dy * dy < 25) setShowPanel((v) => !v);
  };

  const handleMouseMove = (e) => {
    if (!dragging.current) return;

    window.electronAPI?.moveWindowBy?.(
      e.screenX - lastPos.current.x,
      e.screenY - lastPos.current.y
    );

    lastPos.current = { x: e.screenX, y: e.screenY };
  };

  useEffect(() => {
    window.addEventListener("mouseup", handleMouseUp);
    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      window.removeEventListener("mouseup", handleMouseUp);
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  // =====================================================
  // RISK COLOR GLOW
  // =====================================================
  const glowColor =
    riskLevel === "high"
      ? "0 0 22px red"
      : riskLevel === "medium"
      ? "0 0 22px orange"
      : "0 0 18px #4CAF50";

  const riskLevelColor = (level) => {
    if (level === "high") return "red";
    if (level === "medium") return "orange";
    return "green";
  };

  // =====================================================
  // UI RENDER
  // =====================================================
  return (
    <div style={styles.wrapper}>
      {/* 🐱 Floating Cat */}
      <div
        style={{ ...styles.cat, filter: `drop-shadow(${glowColor})` }}
        onMouseDown={handleMouseDown}
        onMouseEnter={() => window.electronAPI?.enableClicks()}
        onMouseLeave={() => window.electronAPI?.disableClicks()}
      >
        <Lottie animationData={catAnimation} loop />
      </div>

      {/* PANEL */}
      {showPanel && (
        <div
          style={styles.panel}
          onMouseEnter={() => window.electronAPI?.enableClicks()}
          onMouseLeave={() => window.electronAPI?.disableClicks()}
        >
          {/* WEBSITE RISK MONITOR */}
          <div style={styles.section}>
            <div style={styles.title}>Website Risk Monitor</div>

            <div style={styles.label}>URL: {currentURL || "None"}</div>

            <div style={styles.label}>
              Risk:{" "}
              <span style={{ fontWeight: "bold", color: riskLevelColor(riskLevel) }}>
                {riskLevel.toUpperCase()}
              </span>
            </div>

            <button style={styles.scanBtn} onClick={() => triggerScan(currentURL)}>
              {isScanning ? "Scanning..." : "Scan Again"}
            </button>

            {/* RISK DETAILS */}
            {scanResult && !scanResult.error && (
              <div style={styles.riskBox}>
                <div><b>Score:</b> {scanResult.riskScore ?? "N/A"}</div>

                <div style={{ marginTop: 6 }}><b>Issues:</b></div>

                <ul>
                  {(scanResult.issues || ["No issues detected"]).map((i, idx) => (
                    <li key={idx}>{i}</li>
                  ))}
                </ul>

                <div style={{ marginTop: 6 }}>
                  <b>Recommendation:</b><br />
                  {scanResult.recommendation || "No recommendation available."}
                </div>
              </div>
            )}
          </div>

          {/* CHAT MODE */}
          <div style={styles.modeButtons}>
            <button style={styles.modeBtn} onClick={() => setMode("chat")}>
              Chat
            </button>
            <button style={styles.modeBtn} onClick={() => setMode("tracking")}>
              Tracking
            </button>
          </div>

          {/* CHAT */}
          {mode === "chat" && (
            <>
              <div style={styles.chatCard}>
                {isThinking && <div>Thinking...</div>}

                <div style={styles.chatDisplay}>{displayedText}</div>
              </div>

              <div style={styles.inputRow}>
                <input
                  style={styles.input}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask something…"
                />
                <button style={styles.sendBtn} onClick={sendMessage}>
                  Send
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// =====================================================
// STYLES
// =====================================================
const styles = {
  wrapper: {
    position: "fixed",
    bottom: "20px",
    left: "20px",
    pointerEvents: "none",
    zIndex: 9999,
  },

  cat: {
    width: "200px",
    height: "200px",
    cursor: "pointer",
    pointerEvents: "auto",
    transition: "0.3s",
  },

  panel: {
    pointerEvents: "auto",
    position: "absolute",
    bottom: "210px",
    left: "0px",
    background: "rgba(255,255,255,0.9)",
    backdropFilter: "blur(12px)",
    padding: "16px",
    borderRadius: "16px",
    width: "380px",
    boxShadow: "0 4px 18px rgba(0,0,0,0.25)",
  },

  section: { marginBottom: "12px" },

  title: { fontWeight: 700, fontSize: 16, marginBottom: 8 },

  label: { fontSize: 13, marginBottom: 4 },

  scanBtn: {
    padding: "6px 12px",
    borderRadius: 8,
    background: "#1976D2",
    color: "white",
    border: "none",
    cursor: "pointer",
    marginTop: 6,
  },

  riskBox: {
    background: "white",
    padding: 10,
    marginTop: 10,
    borderRadius: 8,
    fontSize: 12,
    boxShadow: "0 2px 10px rgba(0,0,0,0.12)",
  },

  modeButtons: {
    marginTop: 10,
    display: "flex",
    gap: 10,
  },

  modeBtn: {
    flex: 1,
    padding: "8px",
    borderRadius: 8,
    background: "#673AB7",
    color: "white",
    cursor: "pointer",
    border: "none",
  },

  chatCard: {
    background: "white",
    borderRadius: 10,
    padding: 10,
    marginTop: 12,
    height: "140px",
    boxShadow: "0 2px 10px rgba(0,0,0,0.1)",
    overflowY: "auto",
  },

  chatDisplay: {
    whiteSpace: "pre-wrap",
    fontSize: 13,
  },

  inputRow: {
    display: "flex",
    gap: 6,
    marginTop: 10,
  },

  input: {
    flex: 1,
    padding: "6px 10px",
    borderRadius: 6,
    border: "1px solid #ccc",
  },

  sendBtn: {
    padding: "6px 12px",
    borderRadius: 6,
    border: "none",
    background: "#4CAF50",
    color: "white",
    cursor: "pointer",
  },
};
