import React, { useState, useEffect, useRef } from "react";
import Lottie from "lottie-react";
import catAnimation from "../public/cat.json";
import ReactMarkdown from "react-markdown";
import Dashboard from "./Dashboard";


const speak = (text) => {
  try {
    const utter = new SpeechSynthesisUtterance(text);
    utter.pitch = 1;
    utter.rate = 1.1;
    speechSynthesis.speak(utter);
  } catch (e) {
    console.warn("Speech error:", e);
  }
};

const MarkdownComponents = {
  h1: (props) => <h1 style={{ fontSize: "15px", fontWeight: "700", color: "#007AFF", margin: "8px 0 4px" }} {...props} />,
  h2: (props) => <h2 style={{ fontSize: "14px", fontWeight: "700", color: "#007AFF", margin: "8px 0 4px" }} {...props} />,
  p: (props) => <p style={{ margin: "0 0 8px 0", fontSize: "13.5px", lineHeight: "1.5" }} {...props} />,
  ul: (props) => <ul style={{ margin: "4px 0 8px", paddingLeft: "18px" }} {...props} />,
  ol: (props) => <ol style={{ margin: "4px 0 8px", paddingLeft: "18px" }} {...props} />,
  li: (props) => <li style={{ marginBottom: "4px" }} {...props} />,
  strong: (props) => <strong style={{ fontWeight: "600", color: "#333" }} {...props} />,
};

export default function Assistant() {

  const [mode, setMode] = useState("chat");
  const [showPanel, setShowPanel] = useState(false);
  const [showDashboard, setShowDashboard] = useState(false);


  const [messages, setMessages] = useState([
    { role: "assistant", text: "Hello! I'm here to help." }
  ]);
  const [input, setInput] = useState("");
  const [isThinking, setIsThinking] = useState(false);


  const [currentApp, setCurrentApp] = useState("");
  const [usageSnapshot, setUsageSnapshot] = useState({});
  const [isTracking, setIsTracking] = useState(false);
  const [sessionData, setSessionData] = useState(null);

  // Local tracking state (Fallback/Browser Mode)
  const [localSessionStart, setLocalSessionStart] = useState(Date.now());
  const [isSessionPaused, setIsSessionPaused] = useState(false);
  const [localActivities, setLocalActivities] = useState([]);
  const [elapsedTime, setElapsedTime] = useState(0);

  // Timer for session duration
  useEffect(() => {
    let interval;
    if (!isSessionPaused) {
      interval = setInterval(() => {
        setElapsedTime(prev => prev + 1000);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isSessionPaused]);

  const logActivity = (action, detail, type = 'neutral') => {
    if (isSessionPaused && type !== 'system') return; // Don't log if paused, unless system event

    // Determine color based on type
    let color = '#34C759'; // Default Safe (Green)
    if (type === 'high') color = '#FF3B30'; // Red
    if (type === 'medium') color = '#FF9500'; // Orange
    if (type === 'neutral') color = '#8E8E93'; // Gray

    setLocalActivities(prev => [{
      time: Date.now(),
      action,
      detail,
      color
    }, ...prev]);
  };

  const toggleSession = () => {
    if (isSessionPaused) {
      // Resume
      setIsSessionPaused(false);
      logActivity("Session Resumed", "User manually resumed tracking", "safe");
    } else {
      // Pause
      logActivity("Session Paused", "User manually paused tracking", "neutral");
      setIsSessionPaused(true);
    }
  };





  const [currentURL, setCurrentURL] = useState("");
  const [scanResult, setScanResult] = useState(null);
  const [riskLevel, setRiskLevel] = useState("safe");
  const [isScanning, setIsScanning] = useState(false);


  const dragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const mouseDownPos = useRef({ x: 0, y: 0 });

  const lastSavedSessionStartRef = useRef(null);
  const chatEndRef = useRef(null);




  useEffect(() => {

    window.electronAPI?.onUsageUpdate?.(({ current, usage }) => {
      setCurrentApp(current);
      setUsageSnapshot({ ...usage });
    });

    window.electronAPI?.requestUsageSnapshot?.();
    window.electronAPI?.onUsageSnapshot?.(({ usage, current }) => {
      setUsageSnapshot({ ...usage });
      setCurrentApp(current);
    });


    window.electronAPI?.onTrackingData?.((data) => {
      setSessionData(data);
      setIsTracking(Boolean(data?.trackingActive));

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


    window.electronAPI?.onURLUpdate?.(({ url }) => {
      setCurrentURL(url);
      if (url.startsWith("http")) triggerScan(url);
    });


    window.electronAPI?.onScanResult?.((result) => {
      setIsScanning(false);
      setScanResult(result || {});

      console.log("Scan Result Received:", result);

      if (!result || result.error) {
        setRiskLevel("safe");
        return;
      }

      const verdict = result.verdict || "SAFE";
      const score = Number(result.riskScore || 0);


      if (verdict === "DANGEROUS" || verdict === "RISKY" || score > 40) {
        if (verdict === "DANGEROUS") {
          setRiskLevel("high");
          speak("Warning. Digital compliance violations detected.");
        } else {
          setRiskLevel("medium");
          speak("Notice. Potential governance issues found.");
        }
        setShowPanel(true);
        setMode("compliance");
      } else {
        setRiskLevel("safe");
      }
    });
    // Initial Activity
    logActivity("System Verified", "Governance Guard Initialized", "safe");
  }, []);


  useEffect(() => {
    if (showPanel && mode === 'chat') {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, showPanel, mode]);




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
          scanResult: scanResult
        }),
      });

      const data = await res.json();
      setMessages(prev => [...prev, { role: "assistant", text: data.reply }]);
    } catch (e) {
      setMessages(prev => [...prev, { role: "assistant", text: "Sorry, I couldn't reach the server." }]);
      logActivity("User Input", "Compliance Query Sent", "neutral");
    } finally {
      setIsThinking(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') sendMessage();
  }

  const triggerScan = (url) => {
    if (!url) return;
    setIsScanning(true);
    setScanResult(null);
    setRiskLevel("safe");
    window.electronAPI?.scanURL?.(url);
    logActivity("Scan Initiated", `Analyzing ${new URL(url).hostname}`, "neutral");
  };




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




  const getGlowColor = () => {
    if (riskLevel === "high") return "rgba(255, 59, 48, 0.8)";
    if (riskLevel === "medium") return "rgba(255, 149, 0, 0.8)";
    return "rgba(52, 199, 89, 0.4)";
  };

  const getStatusColor = () => {
    if (riskLevel === "high") return "#FF3B30";
    if (riskLevel === "medium") return "#FF9500";
    return "#34C759";
  };

  const getStatusText = () => {
    if (isScanning) return "Scanning...";
    return riskLevel === 'high' ? "VIOLATION" : riskLevel === 'medium' ? "WARNING" : "SAFE";
  }




  return (
    <>
      {showDashboard && (
        <Dashboard
          sessionData={sessionData}
          scanResult={scanResult}
          currentURL={currentURL}
          // Pass local tracking data
          localSessionStart={localSessionStart}
          localActivities={localActivities}
          elapsedTime={elapsedTime}
          isPaused={isSessionPaused}
          onToggleSession={toggleSession}
          onClose={() => setShowDashboard(false)}
        />
      )}
      {!showDashboard && (
        <div style={styles.wrapper}>

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


          {showPanel && (
            <div
              style={{
                ...styles.panel,
                background: mode === 'compliance' ? 'rgba(255,255,255,0.95)' : 'rgba(255, 255, 255, 0.85)',
                border: mode === 'compliance' ? `2px solid ${getStatusColor()}` : 'none'
              }}
              className="glass-panel"
              onMouseEnter={() => window.electronAPI?.enableClicks()}
              onMouseLeave={() => window.electronAPI?.disableClicks()}
            >

              <div style={{
                ...styles.header,
                background: mode === 'compliance' ? `linear-gradient(90deg, ${getStatusColor()}11, transparent)` : 'rgba(255,255,255,0.5)'
              }}>
                <div style={styles.headerTitle}>
                  {mode === 'compliance' ? 'Digital Governance Guard' : 'FutureSafe AI'}
                </div>
                <div style={styles.riskBadge}>
                  <div style={{ ...styles.statusDot, background: getStatusColor() }} />
                  {getStatusText()}
                </div>
              </div>


              <div style={styles.content}>


                {mode === "compliance" && (
                  <div style={styles.complianceContainer}>

                    <div style={styles.scoreSection}>
                      <div style={{ fontSize: 48, fontWeight: 800, color: getStatusColor() }}>
                        {scanResult?.riskScore || 0}
                      </div>
                      <div style={{ fontSize: 12, textTransform: 'uppercase', color: '#888', letterSpacing: 1 }}>Risk Score</div>
                    </div>


                    {scanResult?.summary && (
                      <div style={styles.summaryBox}>
                        {scanResult.summary}
                      </div>
                    )}


                    <div style={styles.violationsList}>
                      <div style={{ ...styles.sectionTitle, paddingLeft: 4 }}>Detected Violations</div>

                      {scanResult?.violations?.length > 0 ? (
                        scanResult.violations.map((v, i) => (
                          <div key={i} style={styles.violationCard}>
                            <div style={styles.violationHeader}>
                              <span style={styles.actName}>{v.act}</span>
                              <span style={{
                                ...styles.severityBadge,
                                background: v.severity === 'High' ? '#FFE5E5' : '#FFF4E5',
                                color: v.severity === 'High' ? '#D70015' : '#D97706'
                              }}>
                                {v.severity}
                              </span>
                            </div>
                            <div style={styles.violationReason}>
                              {v.reason}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div style={styles.safeState}>
                          <span style={{ fontSize: 24, marginBottom: 8 }}>🛡️</span>
                          <span>No critical Act violations found.</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}



                {mode === "chat" && (
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
                        <div style={{ ...styles.messageBubble, background: '#F2F2F7', color: '#666' }}>...</div>
                      )}
                      <div ref={chatEndRef} />
                    </div>
                    <div style={styles.inputArea}>
                      <input
                        style={styles.input}
                        placeholder="Ask about compliance..."
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                      />
                      <button style={styles.sendBtn} onClick={sendMessage}>→</button>
                    </div>
                  </div>
                )}


                {mode === "tracking" && (
                  <div style={styles.trackingContainer}>
                    <div style={styles.sectionTitle}>System Status</div>
                    <div style={styles.infoCard}>
                      <div style={styles.label}>Active Website</div>
                      <div style={styles.value}>{currentURL ? new URL(currentURL).hostname : "None"}</div>
                    </div>

                    <div style={styles.infoCard}>
                      <div style={styles.label}>Active App</div>
                      <div style={styles.value}>{currentApp || "Desktop"}</div>
                    </div>

                    <div style={styles.sectionTitle}>Session</div>
                    <div style={styles.infoCard}>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>Tracking Active</span>
                        <input type="checkbox" checked={isTracking} readOnly />
                      </div>
                    </div>

                    <div style={{ padding: '10px 0' }}>
                      <button
                        style={{
                          width: '100%',
                          padding: '12px',
                          background: '#007AFF',
                          color: 'white',
                          border: 'none',
                          borderRadius: '12px',
                          fontSize: '14px',
                          fontWeight: '600',
                          cursor: 'pointer',
                          boxShadow: '0 4px 12px rgba(0,122,255,0.3)'
                        }}
                        onClick={() => {
                          setShowDashboard(true);
                          logActivity("Access", "User viewed Session Report", "safe");
                        }}
                      >
                        View Full Session Report
                      </button>
                    </div>
                  </div>
                )}
              </div>


              <div style={styles.tabBar}>
                <button
                  style={{ ...styles.tabBtn, opacity: mode === 'chat' ? 1 : 0.4, color: '#007AFF' }}
                  onClick={() => setMode('chat')}
                >
                  Chat
                </button>
                <button
                  style={{ ...styles.tabBtn, opacity: mode === 'compliance' ? 1 : 0.4, color: '#FF3B30' }}
                  onClick={() => setMode('compliance')}
                >
                  Compliance
                </button>
                <button
                  style={{ ...styles.tabBtn, opacity: mode === 'tracking' ? 1 : 0.4, color: '#8E8E93' }}
                  onClick={() => setMode('tracking')}
                >
                  System
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}


const styles = {
  wrapper: {
    position: "fixed",
    bottom: "20px",
    left: "20px",
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    zIndex: 9999,
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  },

  cat: {
    width: "160px",
    height: "160px",
    cursor: "grab",
    pointerEvents: "auto",
    zIndex: 2,
    marginBottom: "-20px",
    marginLeft: "10px",
  },

  panel: {
    pointerEvents: "auto",
    position: "absolute",
    bottom: "150px",
    left: "10px",
    width: "360px",
    height: "550px",
    backdropFilter: "blur(30px)",
    WebkitBackdropFilter: "blur(30px)",
    borderRadius: "24px",
    boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255,255,255,0.4) inset",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    animation: "popIn 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
    zIndex: 1,
    transition: "background 0.3s, border 0.3s",
  },

  header: {
    padding: "16px 20px",
    borderBottom: "1px solid rgba(0,0,0,0.05)",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    backdropFilter: "blur(5px)",
  },

  headerTitle: {
    fontWeight: 800,
    fontSize: "17px",
    color: "#1C1C1E",
    letterSpacing: "-0.5px",
  },

  riskBadge: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    background: "rgba(255,255,255,0.9)",
    padding: "4px 10px",
    borderRadius: "20px",
    fontSize: "11px",
    fontWeight: 700,
    boxShadow: "0 2px 4px rgba(0,0,0,0.05)",
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
    background: "rgba(255,255,255,0.4)",
  },


  complianceContainer: {
    padding: "20px",
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },

  scoreSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '10px 0',
  },

  summaryBox: {
    background: "rgba(255,255,255,0.7)",
    padding: "12px",
    borderRadius: "12px",
    fontSize: "13px",
    color: "#444",
    lineHeight: "1.5",
    borderLeft: "4px solid #007AFF",
    boxShadow: "0 2px 8px rgba(0,0,0,0.02)",
  },

  violationsList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },

  violationCard: {
    background: "rgba(255,255,255,0.9)",
    borderRadius: "14px",
    padding: "14px",
    boxShadow: "0 4px 12px rgba(0,0,0,0.03)",
    border: "1px solid rgba(0,0,0,0.03)",
    transition: "transform 0.2s",
  },

  violationHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: "8px",
  },

  actName: {
    fontSize: "14px",
    fontWeight: "700",
    color: "#1C1C1E",
    maxWidth: "80%",
  },

  severityBadge: {
    fontSize: "10px",
    fontWeight: "700",
    padding: "2px 6px",
    borderRadius: "6px",
    textTransform: "uppercase",
  },

  violationReason: {
    fontSize: "12px",
    color: "#555",
    lineHeight: "1.4",
  },

  safeState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px',
    color: '#666',
    fontSize: '14px',
    background: 'rgba(255,255,255,0.5)',
    borderRadius: '16px',
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
    height: "55px",
    display: "flex",
    background: "rgba(255, 255, 255, 0.9)",
    borderTop: "1px solid rgba(0,0,0,0.05)",
    padding: "6px",
    gap: "8px",
    backdropFilter: "blur(10px)",
  },

  tabBtn: {
    flex: 1,
    background: "rgba(0,0,0,0.03)",
    border: "none",
    borderRadius: "12px",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: 700,
    transition: "opacity 0.2s, background 0.2s, transform 0.1s",
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
};


const styleSheet = document.createElement("style");
styleSheet.innerText = `
      @keyframes popIn {
        from {opacity: 0; transform: scale(0.95) translateY(10px); }
      to {opacity: 1; transform: scale(1) translateY(0); }
}
      .glass-panel:hover {
        box - shadow: 0 30px 60px -10px rgba(0,0,0,0.3);
}
      ::-webkit-scrollbar {
        width: 6px;
}
      ::-webkit-scrollbar-track {
        background: transparent;
}
      ::-webkit-scrollbar-thumb {
        background: rgba(0,0,0,0.2);
      borderRadius: 3px;
}
      `;
document.head.appendChild(styleSheet);
