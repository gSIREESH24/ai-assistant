import React, { useState, useEffect, useRef } from "react";
import Lottie from "lottie-react";
import catAnimation from "../public/cat.json";

import ReactMarkdown from "react-markdown";

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

// ... (existing helper functions)

const MarkdownComponents = {
  h1: (props) => <h1 style={{ fontSize: "15px", fontWeight: "700", color: "#007AFF", margin: "8px 0 4px" }} {...props} />,
  h2: (props) => <h2 style={{ fontSize: "14px", fontWeight: "700", color: "#007AFF", margin: "8px 0 4px" }} {...props} />,
  p: (props) => <p style={{ margin: "0 0 8px 0", fontSize: "13.5px", lineHeight: "1.5" }} {...props} />,
  ul: (props) => <ul style={{ margin: "4px 0 8px", paddingLeft: "18px" }} {...props} />,
  ol: (props) => <ol style={{ margin: "4px 0 8px", paddingLeft: "18px" }} {...props} />,
  li: (props) => <li style={{ marginBottom: "4px" }} {...props} />,
  strong: (props) => <strong style={{ fontWeight: "600", color: "#333" }} {...props} />,
};

// ... inside Assistant function ...


export default function Assistant() {
  // PANEL + MODES
  const [mode, setMode] = useState("chat"); // Default to chat mode
  const [showPanel, setShowPanel] = useState(false);

  // CHAT
  const [messages, setMessages] = useState([
    { role: "assistant", text: "Hello! I'm here to help." }
  ]);
  const [input, setInput] = useState("");
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
  const chatEndRef = useRef(null);

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
          }).catch(() => { });
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
      setIsScanning(false);
      setScanResult(result || {});

      if (!result || result.error) {
        setRiskLevel("safe");
        return;
      }

      const verdict = result.verdict || "SAFE";
      const score = Number(result.riskScore || 0);

      // 1. Inject summary into chat
      setMessages(prev => {
        // Avoid duplicate messages if scanning same site multiple times
        const lastMsg = prev[prev.length - 1];
        const newMsg = `I've analyzed this site.\nRisk Score: ${score}/100 (${verdict}).\n${result.issues?.length || 0} potential issues found.`;

        if (lastMsg?.text !== newMsg) {
          return [...prev, { role: "assistant", text: newMsg }];
        }
        return prev;
      });

      // 2. Handle Risk Levels
      if (verdict === "DANGEROUS") {
        setRiskLevel("high");
        speak("Warning. This website may be dangerous.");
        setShowPanel(true);
      } else if (score >= 40) {
        setRiskLevel("medium");
      } else {
        setRiskLevel("safe");
      }
    });
  }, []);

  // Scroll chat to bottom
  useEffect(() => {
    if (showPanel && mode === 'chat') {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, showPanel, mode]);

  // =====================================================
  // SEND CHAT MESSAGE
  // =====================================================
  const sendMessage = async () => {
    if (!input.trim() || isThinking) return;

    const userMsg = input.trim();
    setMessages(prev => [...prev, { role: "user", text: userMsg }]);
    setInput("");
    setIsThinking(true);

    try {
      const res = await fetch("http://localhost:5000/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userMsg,
          url: currentURL,
          scanResult: scanResult // Pass full analysis
        }),
      });

      const data = await res.json();
      setMessages(prev => [...prev, { role: "assistant", text: data.reply }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: "assistant", text: "Sorry, I couldn't reach the server." }]);
    } finally {
      setIsThinking(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') sendMessage();
  }

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

    // Increased threshold to 25px movement to be considered a drag
    if ((dx * dx + dy * dy) < 100) {
      setShowPanel((v) => !v);
    }
  };

  const handleMouseMove = (e) => {
    if (!dragging.current) return;

    const dx = e.screenX - lastPos.current.x;
    const dy = e.screenY - lastPos.current.y;

    window.electronAPI?.moveWindowBy?.(dx, dy);

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
  // RISK STYLING
  // =====================================================
  const getGlowColor = () => {
    if (riskLevel === "high") return "rgba(255, 59, 48, 0.6)";
    if (riskLevel === "medium") return "rgba(255, 149, 0, 0.6)";
    return "rgba(52, 199, 89, 0.4)";
  };

  const getStatusColor = () => {
    if (riskLevel === "high") return "#FF3B30"; // Red
    if (riskLevel === "medium") return "#FF9500"; // Orange
    return "#34C759"; // Green
  };

  const getStatusText = () => {
    if (isScanning) return "Scanning...";
    return riskLevel.toUpperCase();
  }

  // =====================================================
  // UI RENDER
  // =====================================================
  return (
    <div style={styles.wrapper}>
      {/* 🐱 Floating Cat */}
      <div
        style={{
          ...styles.cat,
          filter: `drop-shadow(0 0 30px ${getGlowColor()})`
        }}
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
          className="glass-panel"
          onMouseEnter={() => window.electronAPI?.enableClicks()}
          onMouseLeave={() => window.electronAPI?.disableClicks()}
        >
          {/* Header */}
          <div style={styles.header}>
            <div style={styles.headerTitle}>FutureSafe AI</div>
            <div style={styles.riskBadge}>
              <div style={{ ...styles.statusDot, background: getStatusColor() }} />
              {getStatusText()}
            </div>
          </div>

          {/* Content Area */}
          <div style={styles.content}>
            {mode === "chat" ? (
              <div style={styles.chatContainer}>
                <div style={styles.chatList}>
                  {messages.map((m, i) => (
                    <div key={i} style={{
                      ...styles.messageBubble,
                      alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                      background: m.role === 'user' ? '#007AFF' : '#F2F2F7',
                      color: m.role === 'user' ? '#FFF' : '#1C1C1E',
                    }}>
                      {m.role === 'assistant' ? (
                        <ReactMarkdown components={MarkdownComponents}>
                          {m.text}
                        </ReactMarkdown>
                      ) : (
                        <div style={{ whiteSpace: 'pre-wrap' }}>{m.text}</div>
                      )}
                    </div>
                  ))}
                  {isThinking && (
                    <div style={{ ...styles.messageBubble, background: '#F2F2F7', color: '#666' }}>
                      ...
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
                <div style={styles.inputArea}>
                  <input
                    style={styles.input}
                    placeholder="Ask about this site..."
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                  />
                  <button style={styles.sendBtn} onClick={sendMessage}>→</button>
                </div>
              </div>
            ) : (
              <div style={styles.trackingContainer}>
                <div style={styles.sectionTitle}>Current Session</div>

                {/* URL Info */}
                <div style={styles.infoCard}>
                  <div style={styles.label}>Website</div>
                  <div style={styles.value}>{currentURL ? new URL(currentURL).hostname : "No active site"}</div>
                </div>

                {/* Risk Report */}
                {scanResult && !scanResult.error && (
                  <div style={styles.riskCard}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={styles.label}>Risk Score</span>
                      <span style={{ fontWeight: 'bold', color: getStatusColor() }}>{scanResult.riskScore}/100</span>
                    </div>
                    <div style={{ marginTop: 8 }}>
                      {scanResult.issues && scanResult.issues.length > 0 ? (
                        <ul style={{ paddingLeft: 20, margin: '5px 0', fontSize: 12, color: '#444' }}>
                          {scanResult.issues.map((issue, idx) => (
                            <li key={idx}>{issue}</li>
                          ))}
                        </ul>
                      ) : (
                        <div style={{ fontSize: 12, color: '#666', fontStyle: 'italic' }}>No issues found.</div>
                      )}
                    </div>
                    {scanResult.recommendation && (
                      <div style={{ marginTop: 8, fontSize: 12, borderTop: '1px solid #eee', paddingTop: 6 }}>
                        <strong>Advice: </strong>{scanResult.recommendation}
                      </div>
                    )}
                  </div>
                )}

                <div style={{ ...styles.sectionTitle, marginTop: 15 }}>App Usage</div>
                <div style={styles.infoCard}>
                  <div style={styles.label}>Current App</div>
                  <div style={styles.value}>{currentApp || "Unknown"}</div>
                </div>
              </div>
            )}
          </div>

          {/* Tab Bar */}
          <div style={styles.tabBar}>
            <button
              style={{ ...styles.tabBtn, opacity: mode === 'chat' ? 1 : 0.5 }}
              onClick={() => setMode('chat')}
            >
              Chat
            </button>
            <button
              style={{ ...styles.tabBtn, opacity: mode === 'tracking' ? 1 : 0.5 }}
              onClick={() => setMode('tracking')}
            >
              Risk & Info
            </button>
          </div>
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
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    zIndex: 9999,
  },

  cat: {
    width: "180px",
    height: "180px",
    cursor: "grab",
    pointerEvents: "auto",
    transition: "transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
    zIndex: 2,
  },

  panel: {
    pointerEvents: "auto",
    position: "absolute",
    bottom: "160px", // Just enough to overlap slightly or sit above
    left: "10px",
    width: "320px",
    height: "450px",
    background: "rgba(255, 255, 255, 0.85)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    borderRadius: "24px",
    boxShadow: "0 20px 40px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.5) inset",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    animation: "popIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
    zIndex: 1,
  },

  header: {
    padding: "16px 20px",
    borderBottom: "1px solid rgba(0,0,0,0.05)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    background: "rgba(255,255,255,0.5)",
  },

  headerTitle: {
    fontWeight: 700,
    fontSize: "16px",
    color: "#1C1C1E",
    letterSpacing: "-0.5px",
  },

  riskBadge: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    background: "rgba(255,255,255,0.8)",
    padding: "4px 10px",
    borderRadius: "20px",
    fontSize: "11px",
    fontWeight: 600,
    boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
  },

  statusDot: {
    width: "8px",
    height: "8px",
    borderRadius: "50%",
  },

  content: {
    flex: 1,
    overflowY: "auto",
    padding: "0",
    display: "flex",
    flexDirection: "column",
  },

  chatContainer: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    height: "100%",
  },

  chatList: {
    flex: 1,
    padding: "16px",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
    overflowY: "auto",
  },

  messageBubble: {
    maxWidth: "85%",
    padding: "10px 14px",
    borderRadius: "18px",
    fontSize: "14px",
    lineHeight: "1.4",
    boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
  },

  inputArea: {
    padding: "12px 16px",
    background: "rgba(255,255,255,0.8)",
    borderTop: "1px solid rgba(0,0,0,0.05)",
    display: "flex",
    gap: "8px",
  },

  input: {
    flex: 1,
    background: "rgba(0,0,0,0.05)",
    border: "none",
    borderRadius: "20px",
    padding: "10px 16px",
    fontSize: "14px",
    outline: "none",
    transition: "background 0.2s",
  },

  sendBtn: {
    width: "36px",
    height: "36px",
    borderRadius: "50%",
    background: "#007AFF",
    color: "white",
    border: "none",
    fontSize: "16px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "transform 0.1s",
  },

  trackingContainer: {
    padding: "20px",
  },

  sectionTitle: {
    fontSize: "12px",
    fontWeight: 600,
    textTransform: "uppercase",
    color: "#8E8E93",
    marginBottom: "10px",
    letterSpacing: "0.5px",
  },

  infoCard: {
    background: "white",
    padding: "12px 16px",
    borderRadius: "16px",
    marginBottom: "12px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
  },

  riskCard: {
    background: "#FFFBF0", // light yellow hint
    padding: "14px 16px",
    borderRadius: "16px",
    marginBottom: "12px",
    border: "1px solid rgba(255,149,0,0.2)",
  },

  label: {
    fontSize: "12px",
    color: "#8E8E93",
    marginBottom: "4px",
  },

  value: {
    fontSize: "15px",
    fontWeight: 500,
    color: "#1C1C1E",
    wordBreak: "break-all",
  },

  tabBar: {
    height: "50px",
    display: "flex",
    background: "rgba(249, 249, 249, 0.8)",
    borderTop: "1px solid rgba(0,0,0,0.05)",
    padding: "4px",
    gap: "4px",
  },

  tabBtn: {
    flex: 1,
    background: "transparent",
    border: "none",
    borderRadius: "12px",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: 600,
    color: "#1C1C1E",
    transition: "opacity 0.2s, background 0.2s",
  },
};

// Add keyframe style
const styleSheet = document.createElement("style");
styleSheet.innerText = `
@keyframes popIn {
  from { opacity: 0; transform: scale(0.95) translateY(10px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
.glass-panel:hover {
    box-shadow: 0 25px 50px rgba(0,0,0,0.25);
}
`;
document.head.appendChild(styleSheet);
