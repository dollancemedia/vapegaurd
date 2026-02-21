import React, { useState, useRef, useCallback } from 'react';
import { useUser, useClerk } from '@clerk/clerk-react';
import { useMediaQuery } from 'react-responsive';
import SchoolNotificationSystem from '../components/SchoolNotificationSystem';
import {
  Bell, Shield, Users, LogOut, Volume2, Wifi,
  AlertTriangle, Zap, ChevronRight,
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
const Settings = () => {
  const { user } = useUser();
  const { signOut, openUserProfile, openOrganizationProfile } = useClerk();
  const notificationSystemRef = useRef(null);
  const isMobile = useMediaQuery({ maxWidth: 768 });

  const [activeSection, setActiveSection] = useState('notifications');
  const [testFired, setTestFired] = useState(false);
  const [saveFired, setSaveFired] = useState(false);

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
            {NAV_ITEMS.map(item => {
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
