import React, { useState, useEffect, useRef } from "react";
import Lottie from "lottie-react";
import catAnimation from "../public/cat.json";

export default function Assistant() {
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [displayedText, setDisplayedText] = useState("");

  const [currentApp, setCurrentApp] = useState("");     // <--- ADDED
  const [usageSnapshot, setUsageSnapshot] = useState({}); // <--- ADDED

  const dragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const mouseDownPos = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (window.electronAPI?.onUsageUpdate) {
      window.electronAPI.onUsageUpdate(({ current, usage }) => {
        setCurrentApp(current);
        setUsageSnapshot({ ...usage });

        // 🟥 Cat reacts to distractions
        if (
          current.toLowerCase().includes("youtube") ||
          current.toLowerCase().includes("instagram") ||
          current.toLowerCase().includes("netflix")
        ) {
          setMessages([{ role: "assistant", text: "Stay focused! 🐾" }]);
          setShowChat(true);
        }
      });
    }

    if (window.electronAPI?.requestUsageSnapshot) {
      window.electronAPI.requestUsageSnapshot();
    }

    if (window.electronAPI?.onUsageSnapshot) {
      window.electronAPI.onUsageSnapshot(({ usage, current }) => {
        setUsageSnapshot({ ...usage });
        setCurrentApp(current);
      });
    }
  }, []);

  // Dragging system
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
      const distanceSq = dx * dx + dy * dy;

      if (distanceSq < 25) {
        setShowChat((prev) => !prev);
      }
    }
    dragging.current = false;
  };

  const handleMouseMove = (e) => {
    if (!dragging.current) return;
    window.electronAPI?.moveWindowBy(e.screenX - lastPos.current.x, e.screenY - lastPos.current.y);
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

  // Smooth typing animation for messages
  useEffect(() => {
    if (!messages.length) {
      setDisplayedText("");
      return;
    }

    const full = messages[0].text || "";
    let i = 0;
    setDisplayedText("");

    const interval = setInterval(() => {
      i += 2;
      setDisplayedText(full.slice(0, i));
      if (i >= full.length) clearInterval(interval);
    }, 18);

    return () => clearInterval(interval);
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim()) return;

    const res = await fetch("http://localhost:5000/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: input }),
    });

    const data = await res.json();
    setMessages([{ role: "assistant", text: data.reply }]);
    setInput("");
  };

  // Helper to format seconds to "1h 15m" etc.
  const formatTime = (sec) => {
    if (!sec) return "0m";
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return `${h > 0 ? h + "h " : ""}${m}m`;
  };

  return (
    <div style={styles.wrapper}>
      
      {/* CAT */}
      <div
        style={styles.cat}
        onMouseDown={handleMouseDown}
        onMouseEnter={() => window.electronAPI?.enableClicks()}
        onMouseLeave={() => window.electronAPI?.disableClicks()}
      >
        <Lottie animationData={catAnimation} loop />
      </div>

      {/* PANEL: tracking (left) + gemini/chat (right) */}
      <div style={styles.panelArea}>
        <div style={styles.trackingBox}>
          <div>
            <b>Active:</b> {currentApp || "..."}
          </div>

          <div style={{ marginTop: "4px", fontSize: "13px" }}>
            {Object.entries(usageSnapshot)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3)
              .map(([app, time]) => (
                <div key={app}>
                  {app}: {formatTime(time)}
                </div>
              ))}
          </div>
        </div>

        <div
          style={{
            ...styles.cloud,
            ...(showChat && messages.length > 0 ? styles.floatingIn : {}),
          }}
          onMouseEnter={() => window.electronAPI?.enableClicks()}
          onMouseLeave={() => window.electronAPI?.disableClicks()}
        >
          <div style={styles.cloudScroll}>{showChat && messages.length > 0 ? displayedText : ""}</div>
        </div>
      </div>

      {/* INPUT BAR */}
      {showChat && (
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

    </div>
  );
}

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
    pointerEvents: "auto",
    cursor: "pointer",
  },

  trackingBox: {
    position: "relative",
    background: "rgba(255,255,255,0.9)",
    padding: "8px 12px",
    borderRadius: "10px",
    boxShadow: "0px 3px 10px rgba(0,0,0,0.15)",
    pointerEvents: "auto",
    fontSize: "14px",
  },

  panelArea: {
    position: "absolute",
    bottom: "210px",
    left: "10px",
    display: "flex",
    gap: "10px",
    alignItems: "flex-start",
    pointerEvents: "auto",
    zIndex: 10,
  },

  cloud: {
    background: "white",
    padding: "10px 14px",
    borderRadius: "16px",
    width: "320px",
    maxHeight: "220px",
    boxShadow: "0 4px 14px rgba(0,0,0,0.2)",
    pointerEvents: "auto",
    opacity: 0,
    transform: "translateY(8px) scale(0.98)",
    transition: "opacity 200ms ease-out, transform 200ms ease-out",
  },

  cloudScroll: {
    maxHeight: "180px",
    overflowY: "auto",
    fontSize: "14px",
    paddingRight: "6px",
    lineHeight: 1.5,
    whiteSpace: "pre-wrap",
  },

  inputBar: {
    position: "absolute",
    bottom: "0px",
    left: "10px",
    display: "flex",
    gap: "6px",
    pointerEvents: "auto",
    background: "rgba(255,255,255,0.7)",
    padding: "8px",
    borderRadius: "12px",
    backdropFilter: "blur(6px)",
    opacity: 0,
    transform: "translateY(8px) scale(0.98)",
    transition: "opacity 200ms ease-out, transform 200ms ease-out",
  },

  floatingIn: {
    opacity: 1,
    transform: "translateY(0) scale(1)",
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
  },
};
