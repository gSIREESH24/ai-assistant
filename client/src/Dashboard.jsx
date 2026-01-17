
import React, { useMemo } from 'react';

const Dashboard = ({ sessionData, scanResult, currentURL, localSessionStart, localActivities, elapsedTime, isPaused, onToggleSession, onClose }) => {
  const [view, setView] = React.useState('dashboard'); // 'dashboard' | 'summary'

  // Use passed elapsedTime for duration calculation
  const durationStr = useMemo(() => {
    // If we have real sessionData, use that, otherwise use local elapsedTime
    if (sessionData?.sessionEnd && sessionData?.sessionStart) {
      const diff = sessionData.sessionEnd - sessionData.sessionStart;
      const mins = Math.floor(diff / 60000);
      return `${mins}m ${Math.floor((diff % 60000) / 1000)}s`;
    }

    // Fallback to local timer
    const mins = Math.floor(elapsedTime / 60000);
    return `${mins}m ${Math.floor((elapsedTime % 60000) / 1000)}s`;
  }, [elapsedTime, sessionData]);

  // Merge real data with fallbacks
  const data = useMemo(() => ({
    sessionStart: sessionData?.sessionStart || localSessionStart || Date.now(),
    url: currentURL || "No Active Website",
    riskScore: scanResult?.riskScore || 0,
    // Map violations to "trackers/risks" for the UI
    trackers: scanResult?.violations?.map(v => ({
      name: v.act.split('(')[0].trim(), // Shorten Act name
      type: v.severity,
      risk: v.reason
    })) || [],
    timeline: [
      ...(localActivities || []),
      ...(sessionData?.timeline || [])
    ].sort((a, b) => b.time - a.time) // Newest first
  }), [sessionData, scanResult, currentURL, localSessionStart, localActivities]);

  // durationStr is already calculated above

  const timeString = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  // Simple SVG Charts
  const renderRiskGauge = () => {
    const score = data.riskScore || 0;
    const color = score > 70 ? '#FF3B30' : score > 30 ? '#FF9500' : '#34C759';
    return (
      <svg width="120" height="120" viewBox="0 0 100 100" style={{ animation: 'spinIn 1s ease-out' }}>
        <circle cx="50" cy="50" r="45" fill="none" stroke="#E5E5EA" strokeWidth="8" />
        <circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeDasharray={`${score * 2.83} 283`}
          transform="rotate(-90 50 50)"
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 1s ease-out' }}
        />
        <text x="50" y="55" textAnchor="middle" fontSize="24" fontWeight="bold" fill={color} style={{ animation: 'fadeIn 1s ease-out' }}>{score}</text>
      </svg>
    );
  };

  // Add styles for animations
  React.useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
      @keyframes popIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
      .window-enter { animation: popIn 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
    `;
    document.head.appendChild(style);
    return () => document.head.removeChild(style);
  }, []);

  return (
    <div style={styles.overlay}>
      <div style={styles.window} className="window-enter">
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <div style={styles.logo}>🛡️</div>
            <div>
              <h1 style={styles.title}>{view === 'summary' ? "Detailed Session Log" : "Session Report"}</h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <p style={styles.subtitle}>{new Date(data.sessionStart).toLocaleDateString()}</p>
                {isPaused && <span style={styles.pausedBadge}>PAUSED</span>}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            {view === 'dashboard' ? (
              <>
                <button
                  style={{ ...styles.actionBtn, background: '#F2F2F7', color: '#007AFF' }}
                  onClick={() => setView('summary')}
                >
                  📝 Summarize
                </button>
                <button
                  style={{ ...styles.actionBtn, background: isPaused ? '#34C759' : '#FF3B30', color: 'white' }}
                  onClick={onToggleSession}
                >
                  {isPaused ? "▶ Resume Session" : "⏸ Stop Session"}
                </button>
                <button style={styles.backBtn} onClick={onClose}>
                  ✕ Close
                </button>
              </>
            ) : (
              <button style={{ ...styles.backBtn, background: '#007AFF', color: 'white' }} onClick={() => setView('dashboard')}>
                ← Back to Dashboard
              </button>
            )}
          </div>
        </div>

        {view === 'dashboard' ? (
          <div style={styles.grid}>
            {/* Metrics as individual columns */}
            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Risk Score</h3>
              <div style={styles.gaugeContainer}>
                {renderRiskGauge()}
                <div style={styles.riskLabel}>
                  {data.riskScore > 70 ? "High" : data.riskScore > 30 ? "Medium" : "Safe"}
                </div>
              </div>
            </div>

            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Duration</h3>
              <div style={styles.metricBig}>{durationStr}</div>
              <div style={styles.metricMeta}>
                {timeString(data.sessionStart)} - {timeString(data.sessionEnd)}
              </div>
            </div>

            <div style={styles.card}>
              <h3 style={styles.cardTitle}>Privacy</h3>
              {data.trackers && data.trackers.length > 0 ? (
                <div style={styles.trackerRow}>
                  <span style={styles.trackerCount}>{data.trackers.length}</span>
                  <span style={{ fontSize: '13px', color: '#666' }}>Trackers Blocked</span>
                </div>
              ) : (
                <div style={{ color: '#34C759', fontWeight: 600 }}>All Safe</div>
              )}
            </div>

            {/* Right Column: Compact Timeline */}
            <div style={styles.rightCol}>
              <h3 style={styles.cardTitle}>Recent Activity</h3>
              <div style={styles.timelineContainer}>
                <div style={styles.timeline}>
                  {data.timeline && data.timeline.slice(0, 8).map((item, index) => ( // Limit to 8 items
                    <div key={index} style={styles.timelineItem}>
                      <div style={styles.timeCol}>{timeString(item.time)}</div>
                      <div style={styles.lineCol}>
                        <div style={{
                          ...styles.dot,
                          // Use item's specific color if available, otherwise fallback to safe green
                          borderColor: item.color || '#34C759',
                          background: item.color || '#34C759',
                          boxShadow: `0 0 0 1px ${item.color || '#34C759'}`
                        }} />
                        {index !== Math.min(data.timeline.length, 8) - 1 && <div style={styles.line} />}
                      </div>
                      <div style={styles.contentCol}>
                        <div style={styles.action}>{item.action}</div>
                        <div style={styles.detail}>{item.detail}</div>
                      </div>
                    </div>
                  ))}
                  {data.timeline.length === 0 && <div style={{ color: '#888', padding: '20px' }}>No activity recorded yet.</div>}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div style={styles.summaryContainer}>
            <div style={styles.summaryCard}>
              <h3 style={styles.cardTitle}>Full Session Timeline</h3>
              <div style={styles.fullTimeline}>
                {data.timeline.map((item, index) => (
                  <div key={index} style={styles.fullTimelineItem}>
                    <div style={{ ...styles.timeBadge, background: item.color ? `${item.color}22` : '#F2F2F7', color: item.color || '#555' }}>
                      {timeString(item.time)}
                    </div>
                    <div style={styles.fullLineCol}>
                      <div style={{ ...styles.dot, background: item.color || '#34C759', borderColor: item.color || '#34C759' }} />
                      <div style={styles.fullLine} />
                    </div>
                    <div style={styles.fullContent}>
                      <div style={styles.action}>{item.action}</div>
                      <div style={styles.detail}>{item.detail}</div>
                    </div>
                  </div>
                ))}
                {data.timeline.length === 0 && <div style={{ textAlign: 'center', color: '#888', padding: '40px' }}>No events recorded.</div>}
              </div>
            </div>

            <div style={styles.summaryCard}>
              <h3 style={styles.cardTitle}>Tracked Data Points</h3>
              {data.trackers.length > 0 ? (
                <div style={styles.fullTrackerList}>
                  {data.trackers.map((t, i) => (
                    <div key={i} style={styles.fullTrackerItem}>
                      <div style={styles.trackerIcon}>⚠️</div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '14px', color: '#1C1C1E' }}>{t.name}</div>
                        <div style={{ fontSize: '12px', color: '#8E8E93' }}>Risk: {t.risk}</div>
                      </div>
                      <div style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: 700, padding: '4px 8px', borderRadius: '6px', background: t.type === 'High' ? '#FFD6D6' : '#FFF4E5', color: t.type === 'High' ? '#D70015' : '#D97706' }}>
                        {t.type}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: '30px', textAlign: 'center', color: '#34C759', background: '#F2FFF5', borderRadius: '12px' }}>
                  <b>No Invasive Trackers Detected</b>
                  <p style={{ margin: '4px 0 0', fontSize: '13px', opacity: 0.8 }}>Your session is currently free of known data violations.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const styles = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    background: 'rgba(0,0,0,0.3)', // Dim background
    backdropFilter: 'blur(4px)',
    zIndex: 10000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'auto',
  },
  window: {

    width: '98vw',
    height: '55vh', // High panoramic aspect ratio
    maxWidth: '1800px',
    minHeight: '400px',
    background: '#F5F5F7',
    borderRadius: '24px',
    boxShadow: '0 40px 80px rgba(0,0,0,0.2), 0 0 0 1px rgba(255,255,255,0.5) inset',
    display: 'flex',
    flexDirection: 'column',
    padding: '24px 30px', // slightly less vertical padding
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
    overflow: 'hidden', // No scroll on window itself
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '20px', // Reduced margin for more content space
    flexShrink: 0,
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  logo: {
    fontSize: '32px',
    background: '#FFF',
    width: '56px',
    height: '56px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '16px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
  },
  title: {
    margin: 0,
    fontSize: '24px',
    fontWeight: 800,
    color: '#1C1C1E',
  },
  subtitle: {
    margin: '2px 0 0',
    fontSize: '14px',
    color: '#8E8E93',
    fontWeight: 500,
  },
  backBtn: {
    background: '#E5E5EA',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '10px',
    cursor: 'pointer',
    fontSize: '13px',
    color: '#1C1C1E',
    fontWeight: '600',
    transition: 'all 0.2s',
  },
  actionBtn: {
    border: 'none',
    padding: '8px 16px',
    borderRadius: '10px',
    cursor: 'pointer',
    fontSize: '13px',
    fontWeight: '700',
    transition: 'all 0.2s',
    boxShadow: '0 2px 6px rgba(0,0,0,0.1)'
  },
  pausedBadge: {
    padding: '2px 6px',
    borderRadius: '4px',
    background: '#FF9500',
    color: 'white',
    fontSize: '10px',
    fontWeight: 'bold',
    marginLeft: '6px'
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: '220px 220px 220px 1fr', // 4-Column Horizontal Layout
    gap: '20px',
    flex: 1,
    overflow: 'hidden', // Contain children
  },
  // leftCol removed as we are now flat grid
  rightCol: {
    background: '#FFF',
    borderRadius: '24px',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '0 2px 12px rgba(0,0,0,0.02)',
  },
  card: {
    background: '#FFF',
    borderRadius: '20px',
    padding: '20px',
    boxShadow: '0 2px 12px rgba(0,0,0,0.02)',
    flexShrink: 0,
  },
  cardTitle: {
    margin: '0 0 12px 0',
    fontSize: '13px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    color: '#8E8E93',
    fontWeight: 600,
  },
  metricBig: {
    fontSize: '36px',
    fontWeight: 700,
    color: '#007AFF',
    marginBottom: '4px',
  },
  metricMeta: {
    fontSize: '13px',
    color: '#8E8E93',
  },
  gaugeContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
  },
  riskLabel: {
    fontSize: '15px',
    fontWeight: 600,
    color: '#1C1C1E',
  },
  trackerRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  trackerCount: {
    fontSize: '28px',
    fontWeight: 700,
    color: '#1C1C1E',
  },
  timelineContainer: {
    flex: 1,
    overflowY: 'hidden', // Disable scrolling as requested, or 'auto' if safe
    marginTop: '10px',
  },
  timeline: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0',
  },
  timelineItem: {
    display: 'flex',
    gap: '15px',
    minHeight: '45px', // More compact
  },
  timeCol: {
    width: '60px',
    textAlign: 'right',
    fontSize: '12px',
    color: '#8E8E93',
    paddingTop: '3px',
    fontVariantNumeric: 'tabular-nums',
  },
  lineCol: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: '16px',
  },
  dot: {
    width: '10px',
    height: '10px',
    borderRadius: '50%',
    background: '#007AFF',
    border: '2px solid #FFF',
    boxShadow: '0 0 0 1px #007AFF',
  },
  line: {
    flex: 1,
    width: '2px',
    background: '#E5E5EA',
    margin: '3px 0',
    opacity: 0.5,
  },
  contentCol: {
    flex: 1,
    paddingBottom: '16px',
  },
  action: {
    fontSize: '14px',
    fontWeight: 600,
    color: '#1C1C1E',
    marginBottom: '2px',
  },
  detail: {
    fontSize: '13px',
    color: '#666',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  summaryContainer: {
    display: 'grid',
    gridTemplateColumns: '1.5fr 1fr', // Give more space to timeline in summary too
    gap: '24px',
    height: '100%',
    overflow: 'hidden',
  },
  summaryCard: {
    background: '#FFF',
    borderRadius: '24px',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '0 2px 12px rgba(0,0,0,0.02)',
  },
  fullTimeline: {
    overflowY: 'auto',
    paddingRight: '10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '0',
    marginTop: '10px'
  },
  fullTimelineItem: {
    display: 'flex',
    gap: '12px',
    minHeight: '60px',
  },
  timeBadge: {
    fontSize: '11px',
    fontWeight: 600,
    padding: '4px 8px',
    borderRadius: '6px',
    height: 'fit-content',
    whiteSpace: 'nowrap',
  },
  fullLineCol: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    width: '12px',
    paddingTop: '6px',
  },
  fullLine: {
    flex: 1,
    width: '2px',
    background: '#E5E5EA',
    margin: '4px 0',
    opacity: 0.5,
  },
  fullContent: {
    flex: 1,
    paddingBottom: '20px',
  },
  fullTrackerList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    overflowY: 'auto',
  },
  fullTrackerItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px',
    background: '#F9F9F9',
    borderRadius: '12px',
    border: '1px solid #F0F0F0',
  },
  trackerIcon: {
    fontSize: '20px',
  },
};

export default Dashboard;
