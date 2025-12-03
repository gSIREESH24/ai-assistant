import React, { useState, useEffect, useRef } from "react";
import Lottie from "lottie-react";
import catAnimation from "../public/cat.json";

export default function Assistant() {
  const [showChat, setShowChat] = useState(false); 
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [displayedText, setDisplayedText] = useState("");

  const dragging = useRef(false);
  const lastPos = useRef({ x: 0, y: 0 });
  const mouseDownPos = useRef({ x: 0, y: 0 });

  // Window drag events
  const handleMouseDown = (e) => {
    // Only start dragging on left-click
    if (e.button !== 0) return;
    dragging.current = true;
    lastPos.current = { x: e.screenX, y: e.screenY };
    mouseDownPos.current = { x: e.screenX, y: e.screenY };
  };

  const handleMouseUp = (e) => {
    // If we were dragging, decide if this was a "click" (very small movement)
    if (dragging.current) {
      const dx = e.screenX - mouseDownPos.current.x;
      const dy = e.screenY - mouseDownPos.current.y;
      const distanceSq = dx * dx + dy * dy;

      // Treat as a click only if the mouse barely moved (threshold ~5px)
      if (distanceSq < 25) {
        setShowChat((prev) => !prev);
      }
    }

    dragging.current = false;
  };

  const handleMouseMove = (e) => {
    if (!dragging.current) return;
    const dx = e.screenX - lastPos.current.x;
    const dy = e.screenY - lastPos.current.y;
    if (window.electronAPI?.moveWindowBy) {
      window.electronAPI.moveWindowBy(dx, dy);
    }
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

  // Smooth "typing" effect for assistant replies
  useEffect(() => {
    if (!messages.length) {
      setDisplayedText("");
      return;
    }

    const full = messages[0].text || "";
    let i = 0;
    setDisplayedText("");

    const interval = setInterval(() => {
      i += 2; // reveal 2 chars at a time for a quicker feel
      setDisplayedText(full.slice(0, i));
      if (i >= full.length) {
        clearInterval(interval);
      }
    }, 18);

    return () => clearInterval(interval);
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim()) return;

    const response = await fetch("http://localhost:5000/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: input }),
    });

    const data = await response.json();

    setMessages([{ role: "assistant", text: data.reply }]);
    setInput("");
  };

  const CloudMessage = ({ text }) => {
    return <div style={styles.cloud}>{text}</div>;
  };

  return (
    <div style={styles.wrapper}>
      
      {/* CAT */}
      <div
        style={styles.cat}
        onMouseDown={handleMouseDown}
        onMouseEnter={() => window.electronAPI?.enableClicks && window.electronAPI.enableClicks()}
        onMouseLeave={() => window.electronAPI?.disableClicks && window.electronAPI.disableClicks()}
      >
        <Lottie animationData={catAnimation} loop />
      </div>

      {showChat && messages.length > 0 && (
      <div
        style={{ ...styles.cloudWrapper, ...styles.floatingIn }}
        onMouseEnter={() => window.electronAPI?.enableClicks && window.electronAPI.enableClicks()}
        onMouseLeave={() => window.electronAPI?.disableClicks && window.electronAPI.disableClicks()}
      >
        <div style={styles.cloud}>
          <div
            style={styles.cloudScroll}
            className="cloud-scroll"
          >
            {displayedText}
          </div>
        </div>
      </div>
    )}

      {/* USER INPUT BAR */}
      {showChat && (
        <div
          style={{ ...styles.inputBar, ...styles.floatingIn }}
          onMouseEnter={() => window.electronAPI?.enableClicks && window.electronAPI.enableClicks()}
          onMouseLeave={() => window.electronAPI?.disableClicks && window.electronAPI.disableClicks()}
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

      <style>
        {`
          @keyframes fadeInOut {
            0% { opacity: 0; transform: translateY(10px); }
            10% { opacity: 1; transform: translateY(0); }
            80% { opacity: 1; }
            100% { opacity: 0; transform: translateY(-10px); }
          }
        `}
      </style>

      <style>
          {`
            .cloud-scroll::-webkit-scrollbar {
              width: 6px;
            }
            .cloud-scroll::-webkit-scrollbar-thumb {
              background: rgba(0,0,0,0.3);
              border-radius: 6px;
            }
          `}
          </style>

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

  cloudWrapper: {
    position: "absolute",
    bottom: "220px",
    left: "60px",
    pointerEvents: "none",
    opacity: 0,
    transform: "translateY(8px) scale(0.98)",
    transition: "opacity 200ms ease-out, transform 200ms ease-out",
  },

  cloud: {
    background: "white",
    padding: "10px 14px",
    borderRadius: "16px",
    maxWidth: "270px",
    maxHeight: "200px",   // bubble height limit
    boxShadow: "0 4px 14px rgba(0,0,0,0.2)",
    pointerEvents: "auto",
  },

  cloudScroll: {
    maxHeight: "180px",
    overflowY: "auto",
    fontSize: "14px",
    paddingRight: "6px",
    lineHeight: 1.5,
    whiteSpace: "pre-wrap",
    fontFamily:
      "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
  },


  inputBar: {
    position: "absolute",
    bottom: "0px",
    left: "0px",
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
    fontSize: "14px",
  },

  sendBtn: {
    padding: "6px 12px",
    borderRadius: "8px",
    border: "none",
    background: "#4CAF50",
    color: "white",
  },
};
