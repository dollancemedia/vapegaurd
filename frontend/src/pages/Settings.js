import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useUser, useClerk, useOrganization } from '@clerk/clerk-react';
import { useMediaQuery } from 'react-responsive';
import SchoolNotificationSystem from '../components/SchoolNotificationSystem';
import { useDevices } from '../hooks/useDevices';
import api from '../services/api';
import {
  Bell, Shield, Users, LogOut, Volume2, Wifi,
  AlertTriangle, Zap, ChevronRight, Clock, Calendar, Upload,
} from 'lucide-react';

// ── Custom toggle switch ───────────────────────────────────────────────────────
const Toggle = ({ checked, onChange }) => (
  <button
    role="switch"
    aria-checked={checked}
    onClick={onChange}
    style={{
      width: 44, height: 24, borderRadius: 12,
      background: checked ? 'var(--teal)' : '#e2e8f0',
      border: 'none', cursor: 'pointer',
      position: 'relative', flexShrink: 0,
      transition: 'background 0.22s ease',
      outline: 'none',
      boxShadow: checked ? '0 0 0 3px rgba(0,194,203,0.15)' : 'none',
    }}
  >
    <span style={{
      position: 'absolute', top: 2,
      left: checked ? 22 : 2,
      width: 20, height: 20,
      borderRadius: '50%', background: 'white',
      boxShadow: '0 1px 5px rgba(0,0,0,0.18)',
      transition: 'left 0.22s ease',
      display: 'block',
    }} />
  </button>
);

// ── Icon box helper ────────────────────────────────────────────────────────────
const IconBox = ({ icon, color, bg }) => (
  <div style={{
    width: 36, height: 36, borderRadius: 10,
    background: bg, color,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  }}>
    {icon}
  </div>
);

// ── Row item ──────────────────────────────────────────────────────────────────
const RowItem = ({ icon, color, bg, label, desc, right, borderBottom = true, onClick }) => (
  <div
    onClick={onClick}
    role={onClick ? 'button' : undefined}
    style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '14px 22px',
      borderBottom: borderBottom ? '1px solid rgba(0,0,0,0.045)' : 'none',
      cursor: onClick ? 'pointer' : 'default',
      transition: 'background 0.15s',
    }}
    onMouseEnter={onClick ? e => e.currentTarget.style.background = 'rgba(0,0,0,0.018)' : undefined}
    onMouseLeave={onClick ? e => e.currentTarget.style.background = 'transparent' : undefined}
  >
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <IconBox icon={icon} color={color} bg={bg} />
      <div>
        <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#1a1a1a', lineHeight: 1.3 }}>{label}</div>
        {desc && <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: 1 }}>{desc}</div>}
      </div>
    </div>
    {right}
  </div>
);

// ── Section card shell ────────────────────────────────────────────────────────
const SectionCard = ({ title, subtitle, children }) => (
  <div style={{
    background: 'var(--card-bg)',
    borderRadius: 20,
    border: '1px solid var(--card-border)',
    boxShadow: 'var(--shadow-card)',
    overflow: 'hidden',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
  }}>
    <div style={{ padding: '22px 22px 16px', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
      <h2 style={{
        fontFamily: 'var(--font-display)', fontWeight: 700,
        fontSize: '1.3rem', color: '#1a1a1a', margin: 0,
      }}>{title}</h2>
      {subtitle && (
        <p style={{ fontSize: '0.74rem', color: '#9ca3af', margin: '4px 0 0' }}>{subtitle}</p>
      )}
    </div>
    {children}
  </div>
);

// ── Nav items config ──────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { key: 'notifications', label: 'Notifications', sub: 'Alerts & thresholds', icon: <Bell size={15} /> },
  { key: 'schedule',      label: 'Schedule',      sub: 'School hours & holidays', icon: <Clock size={15} /> },
  { key: 'firmware',      label: 'Firmware',      sub: 'OTA updates',         icon: <Upload size={15} /> },
  { key: 'account',       label: 'Account',       sub: 'Org & security',     icon: <Shield size={15} /> },
];

const TOGGLE_ROWS = [
  {
    key: 'criticalAlerts', label: 'Critical Alerts',
    desc: 'Vape detected — immediate action required',
    icon: <AlertTriangle size={16} />, color: '#ef4444', bg: 'rgba(239,68,68,0.09)',
  },
  {
    key: 'warningAlerts', label: 'Warning Alerts',
    desc: 'Suspected detection, actively monitoring',
    icon: <Bell size={16} />, color: '#f97316', bg: 'rgba(249,115,22,0.09)',
  },
  {
    key: 'onlineStatus', label: 'Online / Offline',
    desc: 'Device connectivity status changes',
    icon: <Wifi size={16} />, color: '#3b82f6', bg: 'rgba(59,130,246,0.09)',
  },
  {
    key: 'soundEnabled', label: 'Sound Effects',
    desc: 'Audio cues for incoming alert events',
    icon: <Volume2 size={16} />, color: '#8b5cf6', bg: 'rgba(139,92,246,0.09)',
  },
];

// ── Main component ────────────────────────────────────────────────────────────
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Hours are entered as LOCAL wall-clock in the device's timezone. The backend
// converts to UTC and the ESP32 runs purely on UTC, so DST never reaches the
// firmware. The preview below is only a courtesy — the server is authoritative.
const TIMEZONES = [
  'America/Los_Angeles', 'America/Denver', 'America/Phoenix', 'America/Chicago',
  'America/New_York', 'America/Anchorage', 'Pacific/Honolulu',
  'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid',
  'Asia/Tokyo', 'Asia/Shanghai', 'Asia/Kolkata', 'Asia/Dubai',
  'Australia/Sydney', 'UTC',
];

const DEFAULT_SCHEDULE = {
  enabled: false,
  timezone: 'America/Los_Angeles',
  local_start_hour: 8, local_start_minute: 0,
  local_end_hour: 15, local_end_minute: 0,
  local_active_days: [1, 2, 3, 4, 5],
  sniff_interval_sec: 60, deep_sense_sec: 30,
  heartbeat_interval: 4, cooldown_sec: 20,
};

/** DST-aware UTC offset (minutes, positive = ahead of UTC) for an IANA zone. */
const tzOffsetMinutes = (tz, at = new Date()) => {
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
    const p = {};
    dtf.formatToParts(at).forEach(({ type, value }) => { p[type] = value; });
    const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day,
                           (+p.hour) % 24, +p.minute, +p.second);
    return Math.round((asUTC - at.getTime()) / 60000);
  } catch {
    return 0;
  }
};

const pad2 = n => String(n).padStart(2, '0');

/** Local HH:MM -> UTC HH:MM plus which day it lands on (-1, 0, +1). */
const localToUtc = (hour, minute, offsetMin) => {
  const total = hour * 60 + minute - offsetMin;
  const dayShift = Math.floor(total / 1440);
  const mod = ((total % 1440) + 1440) % 1440;
  return { hour: Math.floor(mod / 60), minute: mod % 60, dayShift };
};

const Settings = () => {
  const { user } = useUser();
  const { signOut, openUserProfile, openOrganizationProfile } = useClerk();
  const { organization } = useOrganization();
  const isAdmin = organization?.name === 'admin' || organization?.slug === 'admin';
  const school = isAdmin ? 'admin' : organization?.id;
  const { devices } = useDevices(school);
  const notificationSystemRef = useRef(null);
  const isMobile = useMediaQuery({ maxWidth: 768 });

  const [activeSection, setActiveSection] = useState('notifications');
  const [testFired, setTestFired] = useState(false);
  const [saveFired, setSaveFired] = useState(false);

  // ── Schedule state ──────────────────────────────────────────────
  const [selectedDevice, setSelectedDevice] = useState('');
  const [schedule, setSchedule] = useState({ ...DEFAULT_SCHEDULE });
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [scheduleSaved, setScheduleSaved] = useState(false);
  const [scheduleApplyAll, setScheduleApplyAll] = useState(false);

  // ── Firmware state ────────────────────────────────────────────
  const [firmwareList, setFirmwareList] = useState([]);
  const [fwUploading, setFwUploading] = useState(false);
  const [fwVersion, setFwVersion] = useState('');
  const [fwChangelog, setFwChangelog] = useState('');
  const [fwFile, setFwFile] = useState(null);
  const fwInputRef = useRef(null);

  useEffect(() => {
    if (activeSection === 'firmware') {
      api.get('/firmware/list').then(res => setFirmwareList(res.data)).catch(() => {});
    }
  }, [activeSection]);

  const handleFwUpload = async () => {
    if (!fwFile || !fwVersion.trim()) return;
    setFwUploading(true);
    try {
      const form = new FormData();
      form.append('file', fwFile);
      form.append('version', fwVersion.trim());
      form.append('changelog', fwChangelog.trim());
      await api.post('/firmware/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      setFwFile(null); setFwVersion(''); setFwChangelog('');
      if (fwInputRef.current) fwInputRef.current.value = '';
      const res = await api.get('/firmware/list');
      setFirmwareList(res.data);
    } catch (err) {
      alert(err.response?.data?.detail || 'Upload failed');
    } finally {
      setFwUploading(false);
    }
  };

  const handleFwActivate = async (id) => {
    await api.put(`/firmware/activate/${id}`);
    const res = await api.get('/firmware/list');
    setFirmwareList(res.data);
  };

  const handleFwDelete = async (id, version) => {
    if (!window.confirm(`Delete firmware ${version}?`)) return;
    await api.delete(`/firmware/${id}`);
    setFirmwareList(prev => prev.filter(f => f.id !== id));
  };

  // Pick first device on load
  useEffect(() => {
    if (devices.length > 0 && !selectedDevice) {
      setSelectedDevice(devices[0].id || devices[0].device_id);
    }
  }, [devices, selectedDevice]);

  // Fetch schedule when device changes
  useEffect(() => {
    if (!selectedDevice) return;
    setScheduleLoading(true);
    api.get(`/devices/${selectedDevice}/schedule`)
      .then(res => setSchedule({ ...DEFAULT_SCHEDULE, ...res.data }))
      .catch(() => setSchedule({ ...DEFAULT_SCHEDULE }))
      .finally(() => setScheduleLoading(false));
  }, [selectedDevice]);

  const handleScheduleSave = async () => {
    if (schedule.enabled && schedule.local_active_days.length === 0) {
      alert('No active days selected — the sensor will sleep until you update the schedule. Add at least one day.');
      return;
    }
    const targets = scheduleApplyAll
      ? devices.map(d => d.id || d.device_id)
      : [selectedDevice];
    try {
      await Promise.all(targets.map(id =>
        api.put(`/devices/${id}/schedule`, schedule)
      ));
      setScheduleSaved(true);
      setTimeout(() => setScheduleSaved(false), 2000);
    } catch (err) {
      console.error('Schedule save error:', err);
    }
  };

  const toggleDay = (day) => {
    setSchedule(prev => {
      const days = prev.local_active_days.includes(day)
        ? prev.local_active_days.filter(d => d !== day)
        : [...prev.local_active_days, day].sort();
      return { ...prev, local_active_days: days };
    });
  };

  const loadSaved = () => {
    try {
      const raw = localStorage.getItem('notificationSettings');
      return raw ? JSON.parse(raw) : {
        criticalAlerts: true, warningAlerts: true,
        onlineStatus: true, soundEnabled: true, threshold: 75,
      };
    } catch {
      return { criticalAlerts: true, warningAlerts: true, onlineStatus: true, soundEnabled: true, threshold: 75 };
    }
  };

  const [savedSettings, setSavedSettings] = useState(loadSaved);
  const [settings, setSettings] = useState(loadSaved);

  // Dirty check — any key differs from saved
  const isDirty = Object.keys(settings).some(k => settings[k] !== savedSettings[k]);

  const handleSave = () => {
    localStorage.setItem('notificationSettings', JSON.stringify(settings));
    window.dispatchEvent(new Event('notificationSettingsChanged'));
    setSavedSettings({ ...settings });
    setSaveFired(true);
    setTimeout(() => setSaveFired(false), 2000);
  };

  const handleDiscard = () => setSettings({ ...savedSettings });

  const handleToggle = (key) => setSettings(prev => ({ ...prev, [key]: !prev[key] }));
  const handleThreshold = (e) => setSettings(prev => ({ ...prev, threshold: parseInt(e.target.value) }));

  const handleTestNotification = useCallback(() => {
    if (notificationSystemRef.current) {
      notificationSystemRef.current.triggerAlert({
        id: 'test-' + Date.now(),
        type: 'vape',
        location: 'Settings Test Room',
        confidence: 98,
        timestamp: new Date().toISOString(),
      });
      setTestFired(true);
      setTimeout(() => setTestFired(false), 2000);
    }
  }, []);

  const sliderPct = ((settings.threshold - 50) * 100) / 45;

  // ── Shared card style ───────────────────────────────────────────────────────
  const sideCard = {
    background: 'var(--card-bg)',
    borderRadius: 20,
    border: '1px solid var(--card-border)',
    boxShadow: 'var(--shadow-card)',
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    overflow: 'hidden',
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: '100vh',
      padding: isMobile ? '20px 16px 100px' : '32px 32px 60px',
      fontFamily: 'var(--font-body)',
    }}>
      <SchoolNotificationSystem
        ref={notificationSystemRef}
        events={[]}
        isConnected={true}
        soundEnabled={settings.soundEnabled}
      />

      <div style={{
        maxWidth: 980,
        margin: '0 auto',
        display: 'flex',
        flexDirection: isMobile ? 'column' : 'row',
        gap: 20,
        alignItems: 'flex-start',
      }}>

        {/* ── LEFT SIDEBAR ─────────────────────────────────────────────────── */}
        <div style={{ width: isMobile ? '100%' : 224, flexShrink: 0 }}>

          {/* Profile card */}
          <div style={{ ...sideCard, padding: '22px 18px', marginBottom: 12, textAlign: 'center' }}>
            <div style={{ position: 'relative', display: 'inline-block', marginBottom: 12 }}>
              {user?.imageUrl ? (
                <img
                  src={user.imageUrl}
                  alt="Profile"
                  style={{ width: 58, height: 58, borderRadius: '50%', objectFit: 'cover', display: 'block' }}
                />
              ) : (
                <div style={{
                  width: 58, height: 58, borderRadius: '50%',
                  background: 'var(--teal-light)', display: 'flex', alignItems: 'center',
                  justifyContent: 'center', color: 'var(--teal)', fontSize: '1.4rem', fontWeight: 700,
                  fontFamily: 'var(--font-display)',
                }}>
                  {(user?.fullName || 'U')[0].toUpperCase()}
                </div>
              )}
              <div style={{
                position: 'absolute', bottom: 2, right: 2,
                width: 12, height: 12, borderRadius: '50%',
                background: '#22c55e', border: '2.5px solid white',
              }} />
            </div>
            <div style={{
              fontFamily: 'var(--font-display)', fontWeight: 700,
              fontSize: '0.95rem', color: '#1a1a1a', marginBottom: 3,
            }}>
              {user?.fullName || 'User'}
            </div>
            <div style={{
              fontSize: '0.68rem', color: '#9ca3af', marginBottom: 14,
              wordBreak: 'break-all', lineHeight: 1.4,
            }}>
              {user?.primaryEmailAddress?.emailAddress || 'Administrator'}
            </div>
            <button
              onClick={() => openUserProfile()}
              style={{
                width: '100%', padding: '7px 0',
                background: 'rgba(0,194,203,0.07)',
                border: '1px solid rgba(0,194,203,0.22)',
                borderRadius: 10, color: 'var(--teal)',
                fontFamily: 'var(--font-body)',
                fontSize: '0.76rem', fontWeight: 600,
                cursor: 'pointer', transition: 'background 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,194,203,0.13)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,194,203,0.07)'}
            >
              Edit Profile
            </button>
          </div>

          {/* Section nav — vertical on desktop, horizontal tabs on mobile */}
          <div style={{
            ...sideCard,
            padding: isMobile ? 6 : 7,
            display: 'flex',
            flexDirection: isMobile ? 'row' : 'column',
            gap: isMobile ? 4 : 3,
          }}>
            {NAV_ITEMS.filter(item => item.key !== 'firmware' || isAdmin).map(item => {
              const active = activeSection === item.key;
              return (
                <button
                  key={item.key}
                  onClick={() => setActiveSection(item.key)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 9,
                    flex: isMobile ? 1 : undefined,
                    justifyContent: isMobile ? 'center' : 'flex-start',
                    padding: isMobile ? '10px 8px' : '10px 12px',
                    borderRadius: 12, border: 'none',
                    background: active ? 'rgba(0,194,203,0.11)' : 'transparent',
                    color: active ? 'var(--teal)' : '#6b7280',
                    fontFamily: 'var(--font-body)',
                    fontWeight: active ? 600 : 500,
                    fontSize: '0.83rem',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(0,0,0,0.03)'; }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                >
                  {item.icon}
                  {!isMobile && (
                    <div>
                      <div style={{ lineHeight: 1.2 }}>{item.label}</div>
                      <div style={{
                        fontSize: '0.62rem',
                        color: active ? 'rgba(0,194,203,0.65)' : '#c4cad4',
                        fontWeight: 400, marginTop: 1,
                      }}>{item.sub}</div>
                    </div>
                  )}
                  {isMobile && <span>{item.label}</span>}
                </button>
              );
            })}
          </div>

          {!isMobile && (
            <div style={{ textAlign: 'center', fontSize: '0.63rem', color: '#c4cad4', marginTop: 18, letterSpacing: '0.03em' }}>
              Mistio · v2.1.0
            </div>
          )}
        </div>

        {/* ── RIGHT CONTENT ─────────────────────────────────────────────────── */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* ── NOTIFICATIONS SECTION ── */}
          {activeSection === 'notifications' && (
            <SectionCard
              title="Notifications"
              subtitle="Configure when and how you receive detection alerts"
            >
              {/* Toggle rows */}
              {TOGGLE_ROWS.map((row, i, arr) => (
                <RowItem
                  key={row.key}
                  icon={row.icon}
                  color={row.color}
                  bg={row.bg}
                  label={row.label}
                  desc={row.desc}
                  borderBottom={true}
                  right={<Toggle checked={settings[row.key]} onChange={() => handleToggle(row.key)} />}
                />
              ))}

              {/* Sensitivity slider */}
              <div style={{ padding: '18px 22px', borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <IconBox icon={<Zap size={16} />} color="#d97706" bg="rgba(217,119,6,0.09)" />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#1a1a1a' }}>Alert Sensitivity</div>
                      <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: 1 }}>Detection confidence threshold</div>
                    </div>
                  </div>
                  <span style={{
                    fontFamily: 'var(--font-display)', fontWeight: 700,
                    fontSize: '1.4rem', color: 'var(--teal)', lineHeight: 1,
                  }}>
                    {settings.threshold}%
                  </span>
                </div>
                <input
                  type="range"
                  min="50" max="95"
                  value={settings.threshold}
                  onChange={handleThreshold}
                  className="settings-range"
                  style={{
                    width: '100%',
                    background: `linear-gradient(to right, var(--teal) 0%, var(--teal) ${sliderPct}%, #e2e8f0 ${sliderPct}%, #e2e8f0 100%)`,
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 7 }}>
                  <span style={{ fontSize: '0.65rem', color: '#b0b8c4' }}>Sensitive · 50%</span>
                  <span style={{ fontSize: '0.65rem', color: '#b0b8c4' }}>Strict · 95%</span>
                </div>
              </div>

              {/* Test notification */}
              <div style={{ padding: '14px 22px', borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                <button
                  onClick={handleTestNotification}
                  style={{
                    width: '100%', padding: '11px',
                    background: testFired ? 'rgba(34,197,94,0.08)' : 'rgba(0,194,203,0.06)',
                    border: `1px solid ${testFired ? 'rgba(34,197,94,0.25)' : 'rgba(0,194,203,0.2)'}`,
                    borderRadius: 12,
                    color: testFired ? '#22c55e' : 'var(--teal)',
                    fontFamily: 'var(--font-body)',
                    fontWeight: 600, fontSize: '0.82rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    letterSpacing: '0.01em',
                  }}
                >
                  <Bell size={14} />
                  {testFired ? 'Notification Sent!' : 'Send Test Notification'}
                </button>
              </div>

              {/* ── Save / Discard bar ── */}
              <div style={{
                overflow: 'hidden',
                maxHeight: isDirty ? 80 : 0,
                transition: 'max-height 0.3s cubic-bezier(0.4,0,0.2,1)',
              }}>
                <div style={{
                  padding: '12px 22px',
                  borderTop: '1px solid rgba(0,194,203,0.15)',
                  background: 'rgba(0,194,203,0.04)',
                  display: 'flex', alignItems: 'center', gap: 10,
                }}>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 7 }}>
                    <div style={{
                      width: 6, height: 6, borderRadius: '50%',
                      background: '#f59e0b',
                      boxShadow: '0 0 6px rgba(245,158,11,0.7)',
                      animation: 'settingsPulse 1.8s ease-in-out infinite',
                    }} />
                    <span style={{ fontSize: '0.72rem', color: '#6b7280', fontWeight: 500 }}>
                      Unsaved changes
                    </span>
                  </div>
                  <button
                    onClick={handleDiscard}
                    style={{
                      padding: '7px 14px',
                      background: 'transparent',
                      border: '1px solid rgba(0,0,0,0.1)',
                      borderRadius: 9, color: '#6b7280',
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.78rem', fontWeight: 600,
                      cursor: 'pointer', transition: 'all 0.15s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.04)'; e.currentTarget.style.color = '#374151'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#6b7280'; }}
                  >
                    Discard
                  </button>
                  <button
                    onClick={handleSave}
                    style={{
                      padding: '7px 20px',
                      background: saveFired
                        ? 'linear-gradient(135deg,#22c55e,#16a34a)'
                        : 'linear-gradient(135deg,var(--teal),#009fa6)',
                      border: 'none',
                      borderRadius: 9, color: 'white',
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.78rem', fontWeight: 700,
                      cursor: 'pointer',
                      boxShadow: saveFired
                        ? '0 3px 12px rgba(34,197,94,0.35)'
                        : '0 3px 12px rgba(0,194,203,0.35)',
                      transition: 'all 0.2s',
                      display: 'flex', alignItems: 'center', gap: 6,
                    }}
                    onMouseEnter={e => { if (!saveFired) e.currentTarget.style.filter = 'brightness(1.06)'; }}
                    onMouseLeave={e => { e.currentTarget.style.filter = 'none'; }}
                  >
                    {saveFired ? (
                      <>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        Saved!
                      </>
                    ) : (
                      <>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
                        </svg>
                        Save Changes
                      </>
                    )}
                  </button>
                </div>
              </div>
            </SectionCard>
          )}

          {/* ── SCHEDULE SECTION ── */}
          {activeSection === 'schedule' && (
            <SectionCard
              title="Device Schedule"
              subtitle="Set active school hours — sensors sleep outside this window to save battery"
            >
              {/* Device picker */}
              <div style={{ padding: '16px 22px', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                  Device
                </div>
                <select
                  value={selectedDevice}
                  onChange={e => setSelectedDevice(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 12px', borderRadius: 10,
                    border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(0,0,0,0.03)',
                    fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: '#1a1a1a',
                    outline: 'none', cursor: 'pointer',
                  }}
                >
                  {devices.map(d => (
                    <option key={d.id || d.device_id} value={d.id || d.device_id}>
                      {d.name || d.name_override || d.id || d.device_id}
                    </option>
                  ))}
                </select>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, cursor: 'pointer' }}>
                  <input type="checkbox" checked={scheduleApplyAll}
                    onChange={() => setScheduleApplyAll(p => !p)}
                    style={{ accentColor: 'var(--teal)' }}
                  />
                  <span style={{ fontSize: '0.72rem', color: '#6b7280' }}>Apply to all devices</span>
                </label>
              </div>

              {scheduleLoading ? (
                <div style={{ padding: 30, textAlign: 'center', color: '#b0b8c4', fontSize: '0.82rem' }}>Loading schedule...</div>
              ) : (
                <>
                  {/* Enable toggle */}
                  <RowItem
                    icon={<Clock size={16} />}
                    color="#8b5cf6"
                    bg="rgba(139,92,246,0.09)"
                    label="Enable Schedule"
                    desc="Sensor sleeps outside school hours"
                    right={<Toggle checked={schedule.enabled} onChange={() => setSchedule(p => ({ ...p, enabled: !p.enabled }))} />}
                  />

                  {/* School hours */}
                  <div style={{ padding: '16px 22px', borderBottom: '1px solid rgba(0,0,0,0.05)', opacity: schedule.enabled ? 1 : 0.4, pointerEvents: schedule.enabled ? 'auto' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                      <IconBox icon={<Calendar size={16} />} color="#3b82f6" bg="rgba(59,130,246,0.09)" />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '0.875rem', color: '#1a1a1a' }}>School Hours</div>
                        <div style={{ fontSize: '0.7rem', color: '#9ca3af', marginTop: 1 }}>Active monitoring window</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                      <div>
                        <label style={{ fontSize: '0.65rem', fontWeight: 600, color: '#9ca3af', display: 'block', marginBottom: 4 }}>START</label>
                        <input type="time"
                          value={`${pad2(schedule.local_start_hour)}:${pad2(schedule.local_start_minute)}`}
                          onChange={e => { const [h,m] = e.target.value.split(':').map(Number); setSchedule(p => ({...p, local_start_hour: h, local_start_minute: m})); }}
                          style={{
                            padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.1)',
                            fontFamily: 'var(--font-body)', fontSize: '0.88rem', fontWeight: 700,
                            color: '#1a1a1a', background: 'rgba(0,0,0,0.03)', outline: 'none',
                          }}
                        />
                      </div>
                      <span style={{ fontSize: '0.82rem', color: '#9ca3af', fontWeight: 600, paddingTop: 18 }}>to</span>
                      <div>
                        <label style={{ fontSize: '0.65rem', fontWeight: 600, color: '#9ca3af', display: 'block', marginBottom: 4 }}>END</label>
                        <input type="time"
                          value={`${pad2(schedule.local_end_hour)}:${pad2(schedule.local_end_minute)}`}
                          onChange={e => { const [h,m] = e.target.value.split(':').map(Number); setSchedule(p => ({...p, local_end_hour: h, local_end_minute: m})); }}
                          style={{
                            padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.1)',
                            fontFamily: 'var(--font-body)', fontSize: '0.88rem', fontWeight: 700,
                            color: '#1a1a1a', background: 'rgba(0,0,0,0.03)', outline: 'none',
                          }}
                        />
                      </div>
                    </div>

                    {/* Device timezone + what actually goes over the wire */}
                    <div style={{ marginTop: 16 }}>
                      <label style={{ fontSize: '0.65rem', fontWeight: 600, color: '#9ca3af', display: 'block', marginBottom: 6 }}>DEVICE TIMEZONE</label>
                      <select
                        value={schedule.timezone || 'America/Los_Angeles'}
                        onChange={e => setSchedule(p => ({ ...p, timezone: e.target.value }))}
                        style={{
                          padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.1)',
                          fontFamily: 'var(--font-body)', fontSize: '0.82rem', fontWeight: 600,
                          color: '#1a1a1a', background: 'rgba(0,0,0,0.03)', outline: 'none',
                          minWidth: 220, cursor: 'pointer',
                        }}
                      >
                        {TIMEZONES.map(tz => (
                          <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
                        ))}
                      </select>
                      {(() => {
                        const off = tzOffsetMinutes(schedule.timezone || 'UTC');
                        const us = localToUtc(schedule.local_start_hour, schedule.local_start_minute, off);
                        const ue = localToUtc(schedule.local_end_hour, schedule.local_end_minute, off);
                        const sign = off >= 0 ? '+' : '-';
                        const ao = Math.abs(off);
                        const shifted = us.dayShift !== 0 || ue.dayShift !== 0;
                        return (
                          <div style={{ marginTop: 8, fontSize: '0.7rem', color: '#9ca3af', lineHeight: 1.5 }}>
                            Sent to the sensor as{' '}
                            <strong style={{ color: '#1a1a1a' }}>
                              {pad2(us.hour)}:{pad2(us.minute)}–{pad2(ue.hour)}:{pad2(ue.minute)} UTC
                            </strong>
                            {` · UTC${sign}${pad2(Math.floor(ao / 60))}:${pad2(ao % 60)}`}
                            {shifted && ' · window crosses a UTC date boundary'}
                            <br />
                            Daylight saving is applied server-side on every fetch, so this shifts automatically.
                          </div>
                        );
                      })()}
                    </div>

                    {/* Active days */}
                    <div style={{ marginTop: 16 }}>
                      <label style={{ fontSize: '0.65rem', fontWeight: 600, color: '#9ca3af', display: 'block', marginBottom: 6 }}>ACTIVE DAYS</label>
                      <div style={{ display: 'flex', gap: 6 }}>
                        {DAY_LABELS.map((label, i) => {
                          const active = schedule.local_active_days.includes(i);
                          return (
                            <button key={i} onClick={() => toggleDay(i)} style={{
                              width: 38, height: 38, borderRadius: 10,
                              border: active ? '2px solid var(--teal)' : '1px solid rgba(0,0,0,0.1)',
                              background: active ? 'rgba(0,194,203,0.1)' : 'rgba(0,0,0,0.03)',
                              color: active ? 'var(--teal)' : '#9ca3af',
                              fontFamily: 'var(--font-body)', fontSize: '0.68rem', fontWeight: 700,
                              cursor: 'pointer', transition: 'all 0.15s',
                            }}>
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* Advanced sensor timing */}
                  <div style={{ padding: '16px 22px', borderBottom: '1px solid rgba(0,0,0,0.05)', opacity: schedule.enabled ? 1 : 0.5, pointerEvents: schedule.enabled ? 'auto' : 'none' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
                      Sensor Timing
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : '1fr 1fr 1fr 1fr', gap: 12 }}>
                      {[
                        { key: 'sniff_interval_sec', label: 'Sniff Interval', unit: 's', min: 10, max: 300 },
                        { key: 'deep_sense_sec', label: 'Deep Sense', unit: 's', min: 15, max: 120 },
                        { key: 'heartbeat_interval', label: 'Heartbeat Every', unit: 'th', min: 1, max: 20 },
                        { key: 'cooldown_sec', label: 'Cooldown', unit: 's', min: 5, max: 120 },
                      ].map(({ key, label, unit, min, max }) => (
                        <div key={key}>
                          <label style={{ fontSize: '0.62rem', fontWeight: 600, color: '#9ca3af', display: 'block', marginBottom: 4 }}>
                            {label}
                          </label>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                            <input type="number" min={min} max={max}
                              value={schedule[key]}
                              onChange={e => setSchedule(p => ({ ...p, [key]: Math.max(min, Math.min(max, parseInt(e.target.value) || min)) }))}
                              style={{
                                width: '100%', padding: '7px 10px', borderRadius: 8,
                                border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(0,0,0,0.03)',
                                fontFamily: 'var(--font-display)', fontSize: '0.88rem', fontWeight: 700,
                                color: '#1a1a1a', outline: 'none', textAlign: 'center',
                              }}
                            />
                            <span style={{ fontSize: '0.68rem', color: '#9ca3af', fontWeight: 600, flexShrink: 0 }}>{unit}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Save button */}
                  <div style={{ padding: '14px 22px' }}>
                    <button
                      onClick={handleScheduleSave}
                      style={{
                        width: '100%', padding: '12px',
                        background: scheduleSaved
                          ? 'linear-gradient(135deg,#22c55e,#16a34a)'
                          : 'linear-gradient(135deg,var(--teal),#009fa6)',
                        border: 'none', borderRadius: 12, color: 'white',
                        fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '0.85rem',
                        cursor: 'pointer', transition: 'all 0.2s',
                        boxShadow: scheduleSaved
                          ? '0 3px 12px rgba(34,197,94,0.35)'
                          : '0 3px 12px rgba(0,194,203,0.35)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      }}
                    >
                      {scheduleSaved ? (
                        <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg> Schedule Saved!</>
                      ) : (
                        <><Clock size={14} /> Save Schedule{scheduleApplyAll ? ' (All Devices)' : ''}</>
                      )}
                    </button>
                  </div>
                </>
              )}
            </SectionCard>
          )}

          {/* ── FIRMWARE SECTION ── */}
          {activeSection === 'firmware' && isAdmin && (
            <SectionCard title="Firmware Updates" subtitle="Upload new firmware for OTA deployment to sensors">
              {/* Upload form */}
              <div style={{ padding: '18px 22px', borderBottom: '1px solid rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div style={{ flex: 1, minWidth: 140 }}>
                    <label style={{ fontSize: '0.68rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Version</label>
                    <input type="text" placeholder="e.g. 3.2.0" value={fwVersion}
                      onChange={e => setFwVersion(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(0,0,0,0.03)', fontFamily: 'var(--font-display)', fontSize: '0.88rem', fontWeight: 700, color: '#1a1a1a', outline: 'none', boxSizing: 'border-box', marginTop: 4 }}
                    />
                  </div>
                  <div style={{ flex: 2, minWidth: 200 }}>
                    <label style={{ fontSize: '0.68rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Changelog</label>
                    <input type="text" placeholder="What changed?" value={fwChangelog}
                      onChange={e => setFwChangelog(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(0,0,0,0.03)', fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: '#1a1a1a', outline: 'none', boxSizing: 'border-box', marginTop: 4 }}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 10, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input ref={fwInputRef} type="file" accept=".bin"
                    onChange={e => setFwFile(e.target.files[0] || null)}
                    style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: '#6b7280' }}
                  />
                  <button onClick={handleFwUpload} disabled={fwUploading || !fwFile || !fwVersion.trim()}
                    style={{
                      padding: '8px 20px', borderRadius: 10,
                      background: fwUploading ? '#9ca3af' : 'linear-gradient(135deg,var(--teal),#009fa6)',
                      border: 'none', color: 'white', fontFamily: 'var(--font-body)',
                      fontWeight: 700, fontSize: '0.8rem', cursor: fwUploading ? 'not-allowed' : 'pointer',
                      opacity: (!fwFile || !fwVersion.trim()) ? 0.5 : 1,
                    }}
                  >
                    {fwUploading ? 'Uploading…' : 'Upload & Deploy'}
                  </button>
                </div>
              </div>

              {/* Firmware list */}
              <div style={{ padding: '14px 22px' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                  Uploaded Versions
                </div>
                {firmwareList.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px 0', color: '#b0b8c4', fontSize: '0.82rem' }}>
                    No firmware uploaded yet
                  </div>
                ) : (
                  firmwareList.map(fw => (
                    <div key={fw.id} style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
                      borderBottom: '1px solid rgba(0,0,0,0.04)',
                    }}>
                      <div style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: fw.is_active ? '#22c55e' : '#d1d5db',
                        flexShrink: 0,
                      }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.9rem', color: '#1a1a1a' }}>
                            v{fw.version}
                          </span>
                          {fw.is_active && (
                            <span style={{
                              padding: '2px 8px', borderRadius: 6,
                              background: 'rgba(34,197,94,0.1)', color: '#16a34a',
                              fontSize: '0.62rem', fontWeight: 700, textTransform: 'uppercase',
                            }}>Active</span>
                          )}
                          <span style={{ fontSize: '0.7rem', color: '#b0b8c4' }}>
                            {(fw.size / 1024).toFixed(0)} KB
                          </span>
                        </div>
                        {fw.changelog && (
                          <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: 2 }}>{fw.changelog}</div>
                        )}
                        <div style={{ fontSize: '0.65rem', color: '#c4cad4', marginTop: 1 }}>
                          {new Date(fw.uploaded_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                        {!fw.is_active && (
                          <button onClick={() => handleFwActivate(fw.id)}
                            style={{
                              padding: '5px 10px', borderRadius: 8,
                              background: 'rgba(0,194,203,0.08)', border: '1px solid rgba(0,194,203,0.2)',
                              color: 'var(--teal)', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer',
                            }}
                          >Activate</button>
                        )}
                        <button onClick={() => handleFwDelete(fw.id, fw.version)}
                          style={{
                            padding: '5px 10px', borderRadius: 8,
                            background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)',
                            color: '#ef4444', fontSize: '0.68rem', fontWeight: 700, cursor: 'pointer',
                          }}
                        >Delete</button>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Device firmware status */}
              <div style={{ padding: '14px 22px', borderTop: '1px solid rgba(0,0,0,0.06)' }}>
                <div style={{ fontSize: '0.68rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                  Sensor Firmware Status
                </div>
                {devices.length === 0 ? (
                  <div style={{ color: '#b0b8c4', fontSize: '0.82rem' }}>No devices registered</div>
                ) : (
                  devices.map(d => {
                    const fv = d.firmware_version || 'unknown';
                    const activeVer = firmwareList.find(f => f.is_active)?.version;
                    const upToDate = activeVer && fv === activeVer;
                    return (
                      <div key={d.id || d.device_id} style={{
                        display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0',
                        borderBottom: '1px solid rgba(0,0,0,0.03)',
                      }}>
                        <span style={{ fontWeight: 600, fontSize: '0.82rem', color: '#1a1a1a', flex: 1 }}>
                          {d.name || d.device_id}
                        </span>
                        <span style={{
                          padding: '3px 8px', borderRadius: 6, fontSize: '0.68rem', fontWeight: 700,
                          background: upToDate ? 'rgba(34,197,94,0.1)' : fv === 'unknown' ? 'rgba(0,0,0,0.05)' : 'rgba(245,158,11,0.1)',
                          color: upToDate ? '#16a34a' : fv === 'unknown' ? '#9ca3af' : '#d97706',
                        }}>
                          v{fv} {upToDate ? '— up to date' : activeVer && fv !== 'unknown' ? '— update pending' : ''}
                        </span>
                      </div>
                    );
                  })
                )}
              </div>
            </SectionCard>
          )}

          {/* ── ACCOUNT SECTION ── */}
          {activeSection === 'account' && (
            <SectionCard
              title="Account"
              subtitle="Manage your organization, team access, and security"
            >
              <RowItem
                icon={<Users size={16} />}
                color="var(--teal)"
                bg="rgba(0,194,203,0.09)"
                label="Manage Organization"
                desc="Members, roles, and permissions"
                borderBottom
                onClick={() => openOrganizationProfile()}
                right={<ChevronRight size={17} style={{ color: '#d1d5db', flexShrink: 0 }} />}
              />
              <RowItem
                icon={<Shield size={16} />}
                color="#6366f1"
                bg="rgba(99,102,241,0.09)"
                label="Security"
                desc="Password, 2FA, and active sessions"
                borderBottom={false}
                onClick={() => openUserProfile({ label: 'security' })}
                right={<ChevronRight size={17} style={{ color: '#d1d5db', flexShrink: 0 }} />}
              />

              {/* Danger zone */}
              <div style={{
                margin: '0 22px 16px',
                padding: '14px 16px',
                borderRadius: 14,
                background: 'rgba(239,68,68,0.04)',
                border: '1px solid rgba(239,68,68,0.1)',
                marginTop: 16,
              }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#ef4444', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>
                  Danger Zone
                </div>
                <button
                  onClick={() => signOut()}
                  style={{
                    width: '100%', padding: '10px',
                    background: 'rgba(239,68,68,0.07)',
                    border: '1px solid rgba(239,68,68,0.18)',
                    borderRadius: 10,
                    color: '#ef4444',
                    fontFamily: 'var(--font-body)',
                    fontWeight: 600, fontSize: '0.82rem',
                    cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.13)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.07)'}
                >
                  <LogOut size={14} />
                  Sign Out
                </button>
              </div>
            </SectionCard>
          )}
        </div>
      </div>

      {isMobile && (
        <div style={{ textAlign: 'center', fontSize: '0.63rem', color: '#c4cad4', marginTop: 32, letterSpacing: '0.03em' }}>
          Mistio · v2.1.0
        </div>
      )}
    </div>
  );
};

export default Settings;
