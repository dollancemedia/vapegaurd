import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';

// ── SVG Icons ─────────────────────────────────────────────────────────────────
const IconVape = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12h14" />
    <path d="M17 8h2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
    <path d="M3 8v8" />
    <circle cx="7" cy="12" r="1" fill="currentColor" />
    <path d="M10 6c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2" />
  </svg>
);

const IconFire = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 17c1.38 0 2.5-1.12 2.5-2.5 0-1.88-2.5-4-2.5-4S8.5 12.62 8.5 14.5z" fill="currentColor" opacity="0.3" />
    <path d="M12 2C6.48 2 3 6 3 10c0 4.42 3 8 9 12 6-4 9-7.58 9-12 0-4-3.48-8-9-8z" />
  </svg>
);

const IconWifi = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="1" y1="1" x2="23" y2="23" />
    <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
    <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
    <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
    <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
    <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
    <circle cx="12" cy="20" r="1" fill="currentColor" />
  </svg>
);

const IconX = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const IconCheck = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IconBell = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
  </svg>
);

const IconLock = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

// ── SchoolNotificationSystem ──────────────────────────────────────────────────
const SchoolNotificationSystem = forwardRef(({ events, isConnected, soundEnabled = true }, ref) => {
  const [activeAlerts, setActiveAlerts] = useState([]);
  const [lastEventId, setLastEventId] = useState(null);
  const hasNotifications = typeof window !== 'undefined' && 'Notification' in window;
  const [permissionStatus, setPermissionStatus] = useState(
    hasNotifications ? Notification.permission : 'unsupported'
  );
  const [showPermissionBanner, setShowPermissionBanner] = useState(false);
  const [showManualInstruction, setShowManualInstruction] = useState(false);

  const alertTimeoutRef = useRef({});
  const mutedDevicesRef = useRef({});
  const soundEnabledRef = useRef(soundEnabled);

  useEffect(() => { soundEnabledRef.current = soundEnabled; }, [soundEnabled]);

  const checkPermission = () => {
    if (!hasNotifications) { setPermissionStatus('unsupported'); setShowPermissionBanner(false); return; }
    if (Notification.permission === 'granted') { setPermissionStatus('granted'); setShowPermissionBanner(false); }
    else if (Notification.permission === 'denied') { setPermissionStatus('denied'); setShowPermissionBanner(true); }
    else { setPermissionStatus('default'); setShowPermissionBanner(true); }
  };

  useEffect(() => {
    if (hasNotifications) checkPermission();
    else { setPermissionStatus('unsupported'); setShowPermissionBanner(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Suppress linter warning
  useEffect(() => { if (permissionStatus === 'granted') {} }, [permissionStatus]);

  const handleRequestPermission = () => {
    if (!hasNotifications) { setPermissionStatus('unsupported'); return; }
    if (Notification.permission === 'denied') {
      setShowManualInstruction(true);
      alert("Your browser has blocked notifications for this site.\n\nPlease click the lock icon 🔒 in your address bar and set 'Notifications' to 'Allow'.");
      return;
    }
    Notification.requestPermission().then(permission => {
      setPermissionStatus(permission);
      if (permission === 'granted') {
        setShowPermissionBanner(false);
        setShowManualInstruction(false);
        if (hasNotifications) new Notification("Notifications Enabled", { body: "You'll receive real-time vape and fire alerts.", icon: '/logo-2.png' });
      } else if (permission === 'denied') { setShowPermissionBanner(true); }
    });
  };

  const handleIgnorePermission = () => { setShowPermissionBanner(false); setShowManualInstruction(false); };

  useImperativeHandle(ref, () => ({ triggerAlert: triggerSchoolAlert }), []); // eslint-disable-line react-hooks/exhaustive-deps

  // Monitor for new events
  useEffect(() => {
    if (!events || events.length === 0) return;
    const latestEvent = events[0];
    if (latestEvent.id && latestEvent.id.startsWith('test-')) return;
    if (latestEvent.id !== lastEventId) {
      setLastEventId(latestEvent.id);
      if (['vape', 'fire', 'tamper'].includes(latestEvent.type)) {
        const severity = latestEvent.type === 'fire' || latestEvent.type === 'tamper' ? 'critical' : 'warning';
        triggerSchoolAlert({ id: latestEvent.id, device_id: latestEvent.device_id, type: latestEvent.type, location: latestEvent.location, timestamp: latestEvent.timestamp, confidence: latestEvent.confidence, severity });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);

  const triggerSchoolAlert = (event) => {
    if (event.device_id) {
      const muteUntil = mutedDevicesRef.current[event.device_id];
      if (muteUntil && Date.now() < muteUntil) return;
    }
    const eventIdentifier = event.id || event.timestamp;
    const exists = activeAlerts.findIndex(a => (a.event.id || a.event.timestamp) === eventIdentifier && a.event.type === event.type);
    if (exists >= 0 || eventIdentifier === lastEventId) return;

    const alertId = `alert-${Date.now()}`;
    setActiveAlerts(prev => [{ id: alertId, event, timestamp: new Date(), acknowledged: false }, ...prev.slice(0, 4)]);

    if (soundEnabledRef.current && event.type !== 'offline') playAlertSound(event.type);

    if (hasNotifications && Notification.permission === 'granted') {
      try {
        const n = new Notification(`ALERT: ${event.type.toUpperCase()} DETECTED`, {
          body: `Location: ${event.location}\nConfidence: ${event.confidence}%`,
          icon: '/logo-2.png', requireInteraction: true
        });
        n.onclick = () => window.focus();
      } catch (e) { console.error('Native notification failed:', e); }
    }

    alertTimeoutRef.current[alertId] = setTimeout(() => dismissAlert(alertId), 30000);
  };

  const playAlertSound = (eventType) => {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    oscillator.frequency.setValueAtTime(eventType === 'fire' ? 800 : 600, audioContext.currentTime);
    oscillator.type = 'square';
    gainNode.gain.setValueAtTime(0, audioContext.currentTime);
    for (let i = 0; i < 3; i++) {
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime + i * 0.5);
      gainNode.gain.setValueAtTime(0, audioContext.currentTime + i * 0.5 + 0.2);
    }
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 1.5);
  };

  const acknowledgeAlert = (alertId) => {
    const alert = activeAlerts.find(a => a.id === alertId);
    if (alert?.event?.device_id) {
      mutedDevicesRef.current[alert.event.device_id] = Date.now() + 600000;
    }
    setActiveAlerts(prev => prev.map(a => a.id === alertId ? { ...a, isExiting: true } : a));
    if (alertTimeoutRef.current[alertId]) { clearTimeout(alertTimeoutRef.current[alertId]); delete alertTimeoutRef.current[alertId]; }
    alertTimeoutRef.current[alertId] = setTimeout(() => dismissAlert(alertId), 400);
  };

  const dismissAlert = (alertId) => {
    const alertToDismiss = activeAlerts.find(a => a.id === alertId);
    setActiveAlerts(prev => prev.filter(a => a.id !== alertId));
    if (alertTimeoutRef.current[alertId]) { clearTimeout(alertTimeoutRef.current[alertId]); delete alertTimeoutRef.current[alertId]; }
    if (alertToDismiss?.event?.id === lastEventId) {
      const others = activeAlerts.filter(a => a.id !== alertId && a.event.id === alertToDismiss.event.id);
      if (others.length === 0) setLastEventId(null);
    }
  };

  // ── Derive visual config ───────────────────────────────────────────────────
  const getAlertConfig = (type) => {
    switch (type) {
      case 'vape': return { icon: <IconVape />, label: 'Vape Detected', accent: '#00C2CB', glow: 'rgba(0,194,203,0.35)', bg: 'rgba(0,194,203,0.08)', pill: '#00C2CB' };
      case 'fire': return { icon: <IconFire />, label: 'Fire Detected', accent: '#ef4444', glow: 'rgba(239,68,68,0.35)', bg: 'rgba(239,68,68,0.08)', pill: '#ef4444' };
      default:     return { icon: <IconBell />, label: type.toUpperCase(), accent: '#f59e0b', glow: 'rgba(245,158,11,0.35)', bg: 'rgba(245,158,11,0.08)', pill: '#f59e0b' };
    }
  };

  return (
    <>
      {/* ── Permission Banner ─────────────────────────────────────────────── */}
      {showPermissionBanner && (
        <div className="sns-permission-banner">
          <div className="sns-perm-left">
            <span className="sns-perm-icon"><IconLock /></span>
            <div>
              <div className="sns-perm-title">Browser Notifications Blocked</div>
              <div className="sns-perm-sub">
                {showManualInstruction
                  ? 'Click the lock icon in your address bar and set Notifications to Allow.'
                  : 'Allow notifications to receive real-time vape and fire alerts.'}
              </div>
            </div>
          </div>
          <div className="sns-perm-actions">
            {!showManualInstruction && (
              <button className="sns-perm-btn-allow" onClick={handleRequestPermission}>
                <IconBell /> Enable
              </button>
            )}
            <button className="sns-perm-btn-dismiss" onClick={handleIgnorePermission}>
              <IconX />
            </button>
          </div>
        </div>
      )}

      {/* ── Active Alerts ─────────────────────────────────────────────────── */}
      {activeAlerts.length > 0 && (
        <div className="sns-alerts-container">
          {activeAlerts.map((alert) => {
            const cfg = getAlertConfig(alert.event.type);
            const conf = Math.round(alert.event.confidence ?? 0);
            return (
              <div
                key={alert.id}
                className={`sns-alert ${alert.isExiting ? 'sns-exiting' : 'sns-entering'}`}
                style={{ '--accent': cfg.accent, '--glow': cfg.glow, '--alert-bg': cfg.bg }}
              >
                {/* Top accent line */}
                <div className="sns-accent-line" />

                <div className="sns-alert-inner">
                  {/* Icon column */}
                  <div className="sns-icon-col" style={{ background: cfg.bg, border: `1px solid ${cfg.accent}33` }}>
                    <span style={{ color: cfg.accent }}>{cfg.icon}</span>
                  </div>

                  {/* Content */}
                  <div className="sns-content">
                    <div className="sns-top-row">
                      <span className="sns-alert-label" style={{ color: cfg.accent }}>{cfg.label}</span>
                      <span className="sns-alert-time">
                        {alert.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      <button className="sns-btn-x" onClick={(e) => { e.stopPropagation(); dismissAlert(alert.id); }} aria-label="Dismiss">
                        <IconX />
                      </button>
                    </div>

                    <div className="sns-location">{alert.event.location || 'Unknown Location'}</div>
                    <div className="sns-device-id">{alert.event.device_id}</div>

                    {/* Confidence bar */}
                    <div className="sns-conf-row">
                      <span className="sns-conf-label">Confidence</span>
                      <span className="sns-conf-val" style={{ color: cfg.accent }}>{conf}%</span>
                    </div>
                    <div className="sns-conf-track">
                      <div
                        className="sns-conf-fill"
                        style={{ width: `${conf}%`, background: `linear-gradient(90deg, ${cfg.accent}99, ${cfg.accent})` }}
                      />
                    </div>

                    {/* Action */}
                    <div className="sns-action-row">
                      {alert.acknowledged ? (
                        <div className="sns-ack-pill">
                          <IconCheck /> Acknowledged — sensor muted 10 min
                        </div>
                      ) : (
                        <button
                          className="sns-btn-ack"
                          style={{ '--accent': cfg.accent, '--glow': cfg.glow }}
                          onClick={(e) => { e.stopPropagation(); acknowledgeAlert(alert.id); }}
                        >
                          <IconCheck /> Acknowledge
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
});

export default SchoolNotificationSystem;
