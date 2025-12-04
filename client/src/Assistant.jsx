import React, { useState, useEffect, useRef } from "react";
import Lottie from "lottie-react";
import catAnimation from "../public/cat.json";

export default function Assistant() {
  // Which main mode is active: "none" | "tracking" | "chat"
  const [mode, setMode] = useState("none");
  const [showPanel, setShowPanel] = useState(false);

  const [showChat, setShowChat] = useState(false); // internal to chat mode
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [displayedText, setDisplayedText] = useState("");
  const [isThinking, setIsThinking] = useState(false);

  const [currentApp, setCurrentApp] = useState("");
  const [usageSnapshot, setUsageSnapshot] = useState({});

  // Detailed session tracking
  const [isTracking, setIsTracking] = useState(false);
  const [sessionData, setSessionData] = useState(null);

  // Full tracking "page" (overlay)
  const [showTrackingPage, setShowTrackingPage] = useState(false);

  // Remember last saved session (to avoid saving twice)
  const lastSavedSessionStartRef = useRef(null);

  const dragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const mouseDownPos = useRef({ x: 0, y: 0 });

  // ----------------------------------------------
  // PRODUCTIVITY TRACKING LISTENERS
  // ----------------------------------------------
  useEffect(() => {
    if (window.electronAPI?.onUsageUpdate) {
      window.electronAPI.onUsageUpdate(({ current, usage }) => {
        setCurrentApp(current);
        setUsageSnapshot({ ...usage });

        // React to distractions only when chat is open
        if (
          showChat &&
          (
            current.toLowerCase().includes("youtube") ||
            current.toLowerCase().includes("instagram") ||
            current.toLowerCase().includes("netflix")
          )
        ) {
          setMessages([{ role: "assistant", text: "Stay focused! 🐾" }]);
        }
      });
    }

    // Aggregated usage snapshot
    window.electronAPI?.requestUsageSnapshot?.();

    if (window.electronAPI?.onUsageSnapshot) {
      window.electronAPI.onUsageSnapshot(({ usage, current }) => {
        setUsageSnapshot({ ...usage });
        setCurrentApp(current);
      });
    }

    // Session tracking data listener + initial snapshot
    if (window.electronAPI?.onTrackingData) {
      window.electronAPI.onTrackingData((data) => {
        setSessionData(data);
        setIsTracking(Boolean(data?.trackingActive));

         // When a session has ended, send it to backend once
        if (data?.sessionEnd && data?.sessionStart) {
          const last = lastSavedSessionStartRef.current;
          if (!last || last !== data.sessionStart) {
            lastSavedSessionStartRef.current = data.sessionStart;
            // Fire and forget save
            fetch("http://localhost:5000/tracking-session", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                sessionStart: data.sessionStart,
                sessionEnd: data.sessionEnd,
                timeline: data.timeline || [],
              }),
            }).catch(() => {
              // ignore errors in UI, could be logged to console
            });
          }
        }
      });
    }
    window.electronAPI?.requestTrackingData?.();
  }, [showPanel, mode, showChat]);

  // ----------------------------------------------
  // DRAGGING LOGIC
  // ----------------------------------------------
  const handleMouseDown = (e) => {
    if (e.button !== 0) return;
    dragging.current = true;
    lastPos.current = { x: e.screenX, y: e.screenY };
    mouseDownPos.current = { x: e.screenX, y: e.screenY };
  };

  const handleMouseUp = (e) => {
    if (dragging.current) {
      const dx = e.screenX - mouseDownPos.current.x;
      const dy = e.screenY - mouseDownPos.current.y;

      if (dx * dx + dy * dy < 25) {
        // Toggle main panel; if opening and no mode chosen, stay in "chooser"
        setShowPanel((v) => !v);
      }
    }
    dragging.current = false;
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

  // ----------------------------------------------
  // SMOOTH TYPING EFFECT
  // ----------------------------------------------
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

  // ----------------------------------------------
  // SEND MESSAGE
  // ----------------------------------------------
  const sendMessage = async () => {
    if (!input.trim() || isThinking) return;

    setIsThinking(true);
    setDisplayedText("");

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

  const formatTime = (sec) => {
    if (!sec) return "0m";
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return `${h > 0 ? `${h}h ` : ""}${m}m`;
  };

  const formatClock = (ms) => {
    if (!ms) return "-";
    const d = new Date(ms);
    return d.toLocaleTimeString();
  };

  const formatDurationShort = (sec) => {
    if (!sec) return "0s";
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (m === 0) return `${s}s`;
    return `${m}m ${s}s`;
  };

  const handleStartTracking = () => {
    window.electronAPI?.startTrackingSession?.();
    setIsTracking(true);
    setSessionData(null);
  };

  const handleStopTracking = () => {
    window.electronAPI?.stopTrackingSession?.();
    // isTracking will be updated when tracking-data event comes back
  };

  const openChatMode = () => {
    setMode("chat");
    setShowPanel(true);
    setShowChat(true);
    if (!messages.length) {
      setMessages([
        {
          role: "assistant",
          text: "Hey, I’m your productivity buddy. What would you like to work on now?",
        },
      ]);
    }
  };

  const openTrackingMode = () => {
    setMode("tracking");
    setShowPanel(true);
  };

  // ----------------------------------------------
  // RENDER UI
  // ----------------------------------------------
  return (
    <div style={styles.wrapper}>
      {/* 🐱 CAT */}
      <div
        style={styles.cat}
        onMouseDown={handleMouseDown}
        onMouseEnter={() => window.electronAPI?.enableClicks()}
        onMouseLeave={() => window.electronAPI?.disableClicks()}
      >
        <Lottie animationData={catAnimation} loop />
      </div>

      {/* MODE PICKER + PANELS (only when main panel is open) */}
      {showPanel && (
        <div
          style={styles.panelArea}
          onMouseEnter={() => window.electronAPI?.enableClicks()}
          onMouseLeave={() => window.electronAPI?.disableClicks()}
        >
          {/* If no mode, show chooser first */}
          {mode === "none" && (
            <div style={styles.modeChooser}>
              <div style={styles.modeTitle}>What do you want to open?</div>
              <div style={styles.modeButtons}>
                <button style={styles.modeBtnPrimary} onClick={openTrackingMode}>
                  View tracking
                </button>
                <button style={styles.modeBtnSecondary} onClick={openChatMode}>
                  Open chatbot
                </button>
              </div>
            </div>
          )}

          {/* TRACKING MODE */}
          {mode === "tracking" && (
            <div style={styles.trackingCard}>
              <div style={styles.trackingHeader}>
                <div>
                  <div style={{ fontWeight: 600 }}>Focus tracking</div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    See which apps you’ve been on and for how long.
                  </div>
                </div>
                <button
                  style={styles.smallPill}
                  onClick={() => setMode("none")}
                >
                  Change mode
                </button>
              </div>

              <div style={{ fontSize: 13, marginBottom: 4 }}>
                <b>Active App:</b> {currentApp || "..."}
              </div>

              <div style={{ marginTop: 4, fontSize: 13 }}>
                {Object.entries(usageSnapshot)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 3)
                  .map(([app, time]) => (
                    <div key={app}>{app}: {formatTime(time)}</div>
                  ))}
              </div>

              {/* Session controls */}
              <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
                {!isTracking ? (
                  <button style={styles.sessionBtn} onClick={handleStartTracking}>
                    Start session
                  </button>
                ) : (
                  <button style={styles.sessionBtnStop} onClick={handleStopTracking}>
                    Stop & save
                  </button>
                )}
                <button
                  style={styles.sessionBtnSecondary}
                  onClick={() => setShowTrackingPage(true)}
                >
                  Open full view
                </button>
              </div>

              {/* Session summary / timeline (compact) */}
              {sessionData?.sessionStart && (
                <div style={styles.sessionBox}>
                  <div style={{ marginBottom: 4 }}>
                    <b>Session:</b>{" "}
                    {formatClock(sessionData.sessionStart)} –{" "}
                    {sessionData.sessionEnd
                      ? formatClock(sessionData.sessionEnd)
                      : "running..."}
                  </div>

                  <div style={styles.timelineHeader}>
                    <span style={{ flex: 2 }}>App</span>
                    <span style={{ flex: 2 }}>From</span>
                    <span style={{ flex: 2 }}>To</span>
                    <span style={{ flex: 1, textAlign: "right" }}>Time</span>
                  </div>
                  <div style={styles.timelineBody}>
                    {(sessionData.timeline || []).map((row, idx) => (
                      <div key={idx} style={styles.timelineRow}>
                        <span style={{ flex: 2 }}>{row.app}</span>
                        <span style={{ flex: 2 }}>{formatClock(row.start)}</span>
                        <span style={{ flex: 2 }}>{formatClock(row.end)}</span>
                        <span style={{ flex: 1, textAlign: "right" }}>
                          {formatDurationShort(row.durationSec)}
                        </span>
                      </div>
                    ))}
                    {(!sessionData.timeline || sessionData.timeline.length === 0) && (
                      <div style={{ fontSize: 12, opacity: 0.7 }}>
                        No intervals yet – start a session and switch between apps.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* CHATBOT MODE */}
          {mode === "chat" && (
            <div style={{ ...styles.chatCard, ...styles.floatingIn }}>
              <div style={styles.chatHeader}>
                <div>
                  <div style={{ fontWeight: 600 }}>Assistant</div>
                  <div style={{ fontSize: 12, opacity: 0.8 }}>
                    Ask me anything or tell me what you’re working on.
                  </div>
                </div>
                <button
                  style={styles.smallPill}
                  onClick={() => setMode("none")}
                >
                  Change mode
                </button>
              </div>

              {isThinking && (
                <div style={styles.thinkingRow}>
                  <span style={styles.thinkingDot} />
                  <span>Thinking...</span>
                </div>
              )}

              <div style={styles.cloudScroll}>
                {messages.length ? displayedText : ""}
              </div>
            </div>
          )}
        </div>
      )}

      {/* INPUT BAR */}
      {mode === "chat" && showPanel && (
        <div
          style={{ ...styles.inputBar, ...styles.floatingIn }}
          onMouseEnter={() => window.electronAPI?.enableClicks()}
          onMouseLeave={() => window.electronAPI?.disableClicks()}
        >
          <input
            style={styles.input}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask something..."
          />
          <button style={styles.sendBtn} onClick={sendMessage}>
            Send
          </button>
        </div>
      )}
      {/* FULL-SCREEN TRACKING PAGE */}
      {showTrackingPage && (
        <div
          style={styles.trackingPageOverlay}
          onMouseEnter={() => window.electronAPI?.enableClicks()}
          onMouseLeave={() => window.electronAPI?.disableClicks()}
        >
          <div style={styles.trackingPageCard}>
            <div style={styles.trackingPageHeader}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 600 }}>Session Timeline</div>
                <div style={{ fontSize: 13, opacity: 0.8 }}>
                  {sessionData?.sessionStart ? (
                    <>
                      From {formatClock(sessionData.sessionStart)} to{" "}
                      {sessionData.sessionEnd
                        ? formatClock(sessionData.sessionEnd)
                        : "now"}
                    </>
                  ) : (
                    "Start a session from the small panel to see details here."
                  )}
                </div>
              </div>
              <button
                style={styles.trackingPageClose}
                onClick={() => setShowTrackingPage(false)}
              >
                Close
              </button>
            </div>

            <div style={styles.trackingPageBody}>
              <div style={styles.trackingPageTableHeader}>
                <span style={{ flex: 2 }}>App</span>
                <span style={{ flex: 2 }}>From</span>
                <span style={{ flex: 2 }}>To</span>
                <span style={{ flex: 1, textAlign: "right" }}>Duration</span>
              </div>
              <div style={styles.trackingPageTableBody}>
                {(sessionData?.timeline || []).map((row, idx) => (
                  <div key={idx} style={styles.trackingPageRow}>
                    <span style={{ flex: 2 }}>{row.app}</span>
                    <span style={{ flex: 2 }}>{formatClock(row.start)}</span>
                    <span style={{ flex: 2 }}>{formatClock(row.end)}</span>
                    <span style={{ flex: 1, textAlign: "right" }}>
                      {formatDurationShort(row.durationSec)}
                    </span>
                  </div>
                ))}
                {(!sessionData?.timeline || sessionData.timeline.length === 0) && (
                  <div style={{ fontSize: 13, opacity: 0.7 }}>
                    No intervals yet. Start a session and switch between apps to see a
                    detailed history here.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------
// STYLES
// ----------------------------------------------
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
  },

  panelArea: {
    position: "absolute",
    bottom: "210px",
    left: "10px",
    display: "flex",
    gap: "10px",
    pointerEvents: "auto",
    zIndex: 20,
  },

  trackingCard: {
    background: "linear-gradient(135deg, rgba(255,255,255,0.98), rgba(236,248,255,0.98))",
    padding: "12px 16px",
    borderRadius: "16px",
    width: "230px",
    boxShadow: "0 6px 18px rgba(0,0,0,0.18)",
    pointerEvents: "auto",
    fontSize: "14px",
    backdropFilter: "blur(8px)",
  },

  trackingHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },

  chatCard: {
    background:
      "linear-gradient(135deg, #ff9a9e 0%, #fad0c4 45%, #fbc2eb 100%)",
    padding: "12px 16px",
    borderRadius: "16px",
    width: "320px",
    maxHeight: "220px",
    boxShadow: "0 6px 18px rgba(0,0,0,0.18)",
    pointerEvents: "auto",
    opacity: 0,
    transform: "translateY(8px) scale(0.98)",
    transition: "opacity 200ms ease-out, transform 200ms ease-out",
  },

  chatHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },

  cloudScroll: {
    maxHeight: "170px",
    overflowY: "auto",
    fontSize: "14px",
    lineHeight: 1.5,
    padding: "8px 10px",
    marginTop: 4,
    background: "rgba(255,255,255,0.9)",
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.7)",
    whiteSpace: "pre-wrap",
    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.4)",
  },

  floatingIn: {
    opacity: 1,
    transform: "translateY(0) scale(1)",
  },

  inputBar: {
    position: "absolute",
    bottom: "0px",
    left: "10px",
    display: "flex",
    gap: "6px",
    padding: "8px",
    background: "rgba(255,255,255,0.75)",
    borderRadius: "12px",
    backdropFilter: "blur(6px)",
    pointerEvents: "auto",
    opacity: 0,
    transform: "translateY(8px)",
    transition: "opacity 200ms ease-out, transform 200ms ease-out",
  },

  input: {
    flex: 1,
    padding: "6px 10px",
    borderRadius: "8px",
    border: "1px solid #ccc",
  },

  sendBtn: {
    padding: "6px 12px",
    borderRadius: "8px",
    border: "none",
    background: "#4CAF50",
    color: "white",
    cursor: "pointer",
  },

  sessionBtn: {
    flex: 1,
    padding: "4px 8px",
    borderRadius: "8px",
    border: "none",
    background: "#1976D2",
    color: "white",
    cursor: "pointer",
    fontSize: "12px",
  },

  sessionBtnStop: {
    flex: 1,
    padding: "4px 8px",
    borderRadius: "8px",
    border: "none",
    background: "#D32F2F",
    color: "white",
    cursor: "pointer",
    fontSize: "12px",
  },

  sessionBox: {
    marginTop: 10,
    paddingTop: 6,
    borderTop: "1px solid rgba(0,0,0,0.1)",
    fontSize: 12,
  },

  timelineHeader: {
    display: "flex",
    gap: 4,
    fontWeight: 600,
    marginBottom: 4,
  },

  timelineBody: {
    maxHeight: 120,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },

  timelineRow: {
    display: "flex",
    gap: 4,
  },

  // Full tracking page styles
  trackingPageOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10000,
    pointerEvents: "auto",
  },

  trackingPageCard: {
    width: "80vw",
    maxWidth: 900,
    height: "70vh",
    background: "white",
    borderRadius: 16,
    boxShadow: "0 12px 34px rgba(0,0,0,0.3)",
    display: "flex",
    flexDirection: "column",
    padding: 20,
  },

  trackingPageHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },

  trackingPageClose: {
    borderRadius: 999,
    border: "none",
    padding: "6px 12px",
    fontSize: 12,
    cursor: "pointer",
    background: "#eeeeee",
  },

  trackingPageBody: {
    flex: 1,
    marginTop: 8,
    borderRadius: 10,
    border: "1px solid #e0e0e0",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },

  trackingPageTableHeader: {
    display: "flex",
    padding: "8px 10px",
    background: "#f5f5f5",
    fontWeight: 600,
    fontSize: 13,
  },

  trackingPageTableBody: {
    flex: 1,
    overflowY: "auto",
    padding: "6px 10px",
    fontSize: 13,
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },

  trackingPageRow: {
    display: "flex",
    padding: "4px 0",
    borderBottom: "1px solid rgba(0,0,0,0.04)",
  },

  sessionBtnSecondary: {
    flex: 1,
    padding: "4px 8px",
    borderRadius: "8px",
    border: "1px solid #1976D2",
    background: "white",
    color: "#1976D2",
    cursor: "pointer",
    fontSize: "12px",
  },

  modeChooser: {
    background: "linear-gradient(135deg, rgba(255,255,255,0.98), rgba(230,244,255,0.98))",
    padding: "12px 16px",
    borderRadius: "16px",
    width: "260px",
    boxShadow: "0 6px 18px rgba(0,0,0,0.18)",
    pointerEvents: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    backdropFilter: "blur(8px)",
  },

  modeTitle: {
    fontWeight: 600,
    fontSize: 14,
  },

  modeButtons: {
    display: "flex",
    gap: 8,
  },

  modeBtnPrimary: {
    flex: 1,
    padding: "6px 10px",
    borderRadius: 999,
    border: "none",
    background: "linear-gradient(135deg, #1976D2, #42A5F5)",
    color: "white",
    cursor: "pointer",
    fontSize: 13,
  },

  modeBtnSecondary: {
    flex: 1,
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid rgba(103,58,183,0.7)",
    background: "white",
    color: "#673AB7",
    cursor: "pointer",
    fontSize: 13,
  },

  smallPill: {
    padding: "3px 8px",
    borderRadius: 999,
    border: "none",
    background: "rgba(0,0,0,0.05)",
    fontSize: 11,
    cursor: "pointer",
  },

  thinkingRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    padding: "4px 2px 0",
    color: "rgba(0,0,0,0.7)",
  },

  thinkingDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#4CAF50",
    boxShadow: "0 0 6px rgba(76,175,80,0.7)",
  },
};
