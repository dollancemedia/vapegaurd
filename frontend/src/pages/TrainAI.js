import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useTrainingRecorder } from '../hooks/useTrainingRecorder';
import { useWebSocket } from '../hooks/useWebSocket';
import { useDevices } from '../hooks/useDevices';
import { trainingService } from '../services/trainingService';
import './TrainAI.css';

// ── Class config ─────────────────────────────────────────────────────────────
const CLASS_CONFIG = {
  vape:           { label: 'Vape',           color: '#ef4444', icon: '💨' },
  cologne:        { label: 'Cologne',        color: '#f59e0b', icon: '🧴' },
  body_spray:     { label: 'Body Spray',     color: '#f97316', icon: '🫧' },
  hair_spray:     { label: 'Hair Spray',     color: '#a855f7', icon: '💇' },
  cleaning_spray: { label: 'Cleaning Spray', color: '#3b82f6', icon: '🧹' },
  shower_steam:   { label: 'Shower Steam',   color: '#06b6d4', icon: '🚿' },
  fire:           { label: 'Fire',           color: '#dc2626', icon: '🔥' },
  clean_air:      { label: 'Clean Air',      color: '#22c55e', icon: '🌿' },
};

const DISTANCES = [1, 3, 6, 10];

// ── Progress Bar Component ───────────────────────────────────────────────────
function ProgressOverview({ progress, priority }) {
  if (!progress) return null;

  return (
    <div className="train-progress-grid">
      {Object.entries(progress).map(([cls, data]) => {
        const config = CLASS_CONFIG[cls] || { label: cls, color: '#6b7280', icon: '?' };
        const pct = Math.min(100, Math.round(data.ratio * 100));
        const isPriority = cls === priority;

        return (
          <div key={cls} className={`train-progress-item ${isPriority ? 'priority' : ''}`}>
            <div className="train-progress-header">
              <span className="train-progress-icon">{config.icon}</span>
              <span className="train-progress-label">{config.label}</span>
              {isPriority && <span className="train-priority-badge">Priority</span>}
              <span className="train-progress-count">
                {data.collected}/{data.target}
              </span>
            </div>
            <div className="train-progress-bar-track">
              <div
                className="train-progress-bar-fill"
                style={{
                  width: `${pct}%`,
                  backgroundColor: pct >= 80 ? '#22c55e' : pct >= 40 ? '#f59e0b' : '#ef4444',
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Live Sensor Feed ─────────────────────────────────────────────────────────
function LiveSensorFeed({ latestReading }) {
  if (!latestReading) {
    return <div className="train-sensor-feed empty">Waiting for sensor data...</div>;
  }

  const readings = [
    { label: 'PM2.5', value: latestReading.pm25?.toFixed(1), unit: 'ug/m3' },
    { label: 'PM10', value: latestReading.pm10?.toFixed(1), unit: 'ug/m3' },
    { label: 'Humidity', value: latestReading.humidity?.toFixed(1), unit: '%' },
    { label: 'Gas', value: latestReading.gas_resistance?.toFixed(0), unit: 'ohm' },
    { label: 'Temp', value: latestReading.temperature?.toFixed(1), unit: 'C' },
  ];

  return (
    <div className="train-sensor-feed">
      {readings.map((r) => (
        <div key={r.label} className="train-sensor-reading">
          <span className="train-sensor-label">{r.label}</span>
          <span className="train-sensor-value">{r.value ?? '--'}</span>
          <span className="train-sensor-unit">{r.unit}</span>
        </div>
      ))}
    </div>
  );
}

// ── Mini Chart (simple SVG sparkline of PM2.5) ──────────────────────────────
function MiniChart({ samples, height = 80 }) {
  if (!samples || samples.length < 2) {
    return <div className="train-mini-chart empty">Recording...</div>;
  }

  const pm25Vals = samples.map(s => s.pm25 ?? s.sensor_data?.pm25 ?? 0);
  const maxVal = Math.max(...pm25Vals, 1);
  const minVal = Math.min(...pm25Vals, 0);
  const range = maxVal - minVal || 1;
  const w = 400;
  const h = height;
  const padding = 4;

  const points = pm25Vals.map((v, i) => {
    const x = padding + (i / (pm25Vals.length - 1)) * (w - padding * 2);
    const y = h - padding - ((v - minVal) / range) * (h - padding * 2);
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="train-mini-chart">
      <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" width="100%" height={h}>
        <polyline
          fill="none"
          stroke="var(--teal)"
          strokeWidth="2"
          points={points}
        />
      </svg>
      <div className="train-chart-labels">
        <span>PM2.5: {pm25Vals[pm25Vals.length - 1]?.toFixed(1)}</span>
        <span>Peak: {maxVal.toFixed(1)}</span>
      </div>
    </div>
  );
}

// ── Timer Display ────────────────────────────────────────────────────────────
function TimerDisplay({ elapsed }) {
  const mins = Math.floor(elapsed / 60);
  const secs = Math.floor(elapsed % 60);
  const tenths = Math.floor((elapsed % 1) * 10);
  return (
    <div className="train-timer">
      {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}.{tenths}
    </div>
  );
}

// ── Session History ──────────────────────────────────────────────────────────
function SessionHistory({ labels }) {
  if (!labels || labels.length === 0) {
    return <div className="train-session-empty">No events recorded yet in this session.</div>;
  }

  return (
    <div className="train-session-table">
      <div className="train-session-header-row">
        <span>#</span>
        <span>Class</span>
        <span>Duration</span>
        <span>Distance</span>
        <span>Time</span>
        <span>Status</span>
      </div>
      {labels.map((label, idx) => {
        const config = CLASS_CONFIG[label.event_type] || { label: label.event_type, icon: '?' };
        const start = new Date(label.start_time_zulu);
        const end = new Date(label.end_time_zulu);
        const durationSec = Math.round((end - start) / 1000);
        const timeStr = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        return (
          <div key={label.label_id} className="train-session-row">
            <span className="train-session-num">{labels.length - idx}</span>
            <span className="train-session-class">
              {config.icon} {config.label}
            </span>
            <span>{durationSec}s</span>
            <span>{label.distance_ft}ft</span>
            <span>{timeStr}</span>
            <span className={`train-status-badge ${label.status}`}>
              {label.status}
            </span>
          </div>
        );
      })}
    </div>
  );
}


// ── Main TrainAI Page ────────────────────────────────────────────────────────
export default function TrainAI() {
  const recorder = useTrainingRecorder();
  const { devices } = useDevices();
  const [progress, setProgress] = useState(null);
  const [priority, setPriority] = useState(null);
  const [latestReading, setLatestReading] = useState(null);
  const latestReadingRef = useRef(null);

  // Fetch progress on mount and after each confirm
  const loadProgress = useCallback(async () => {
    try {
      const data = await trainingService.getProgress();
      setProgress(data.progress);
      setPriority(data.priority);
    } catch (e) {
      console.error('Failed to load progress:', e);
    }
  }, []);

  useEffect(() => {
    loadProgress();
  }, [loadProgress, recorder.sessionLabels.length]);

  // WebSocket for live sensor data
  const handleWsMessage = useCallback((data) => {
    if (data.type === 'sensor_data' && data.data) {
      const sensorData = data.data.sensor_data || data.data;
      const msgDeviceId = data.data.device_id || sensorData.device_id;

      if (msgDeviceId === recorder.deviceId) {
        const reading = {
          pm25: sensorData.pm25,
          pm10: sensorData.pm10,
          pm1: sensorData.pm1,
          humidity: sensorData.humidity,
          temperature: sensorData.temperature,
          gas_resistance: sensorData.gas_resistance,
          timestamp: data.timestamp || new Date().toISOString(),
          device_id: msgDeviceId,
        };
        setLatestReading(reading);
        latestReadingRef.current = reading;

        // If recording, add sample
        if (recorder.state === recorder.STATES.RECORDING) {
          recorder.addSample(reading);
        }
      }
    }
  }, [recorder]);

  useWebSocket('/ws/events', {
    onMessage: handleWsMessage,
    enabled: !!recorder.deviceId,
  });

  // Online devices for the selector
  const onlineDevices = (devices || []).filter(d => d.isOnline);

  // Auto-select first online device if none selected
  useEffect(() => {
    if (!recorder.deviceId && onlineDevices.length > 0) {
      recorder.selectDevice(onlineDevices[0].id);
    }
  }, [onlineDevices, recorder]);

  return (
    <div className="train-ai-page">
      {/* ── Section A: Progress Overview ─────────────────────────── */}
      <section className="train-section train-section-progress">
        <h2 className="train-section-title">Collection Progress</h2>
        <ProgressOverview progress={progress} priority={priority} />
      </section>

      {/* ── Section B: Recording Interface ───────────────────────── */}
      <section className="train-section train-section-recorder">
        <div className="train-recorder-layout">
          {/* Left: Controls */}
          <div className="train-controls-panel">
            {/* Device selector */}
            <div className="train-field">
              <label>Device</label>
              <select
                value={recorder.deviceId || ''}
                onChange={(e) => recorder.selectDevice(e.target.value || null)}
                disabled={recorder.state === recorder.STATES.RECORDING}
              >
                <option value="">Select device...</option>
                {onlineDevices.map(d => (
                  <option key={d.id} value={d.id}>{d.name} ({d.id})</option>
                ))}
                {onlineDevices.length === 0 && (
                  <option disabled>No devices online</option>
                )}
              </select>
            </div>

            {/* Class selector */}
            <div className="train-field">
              <label>Event Class</label>
              <div className="train-class-grid">
                {Object.entries(CLASS_CONFIG).map(([key, cfg]) => (
                  <button
                    key={key}
                    className={`train-class-pill ${recorder.eventType === key ? 'active' : ''}`}
                    style={recorder.eventType === key ? { backgroundColor: cfg.color, borderColor: cfg.color } : {}}
                    onClick={() => recorder.setEventType(key)}
                    disabled={recorder.state === recorder.STATES.RECORDING}
                  >
                    {cfg.icon} {cfg.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Distance */}
            <div className="train-field">
              <label>Distance</label>
              <div className="train-distance-row">
                {DISTANCES.map(d => (
                  <button
                    key={d}
                    className={`train-distance-btn ${recorder.distance === d ? 'active' : ''}`}
                    onClick={() => recorder.setDistance(d)}
                    disabled={recorder.state === recorder.STATES.RECORDING}
                  >
                    {d}ft
                  </button>
                ))}
              </div>
            </div>

            {/* Notes */}
            <div className="train-field">
              <label>Notes</label>
              <input
                type="text"
                placeholder="e.g. Puff bar, single puff"
                value={recorder.notes}
                onChange={(e) => recorder.setNotes(e.target.value)}
              />
            </div>
          </div>

          {/* Right: Recording area */}
          <div className="train-recording-panel">
            {/* Live sensor feed */}
            <LiveSensorFeed latestReading={latestReading} />

            {/* Baseline indicator */}
            {recorder.state === recorder.STATES.WAITING_BASELINE && (
              <div className={`train-baseline-status ${recorder.baselineStable ? 'stable' : 'unstable'}`}>
                {recorder.baselineStable ? (
                  <span>Baseline stable - Ready to record</span>
                ) : (
                  <span>
                    Waiting for stable baseline...
                    {recorder.baselineInfo?.reason && (
                      <small> ({recorder.baselineInfo.reason})</small>
                    )}
                  </span>
                )}
              </div>
            )}

            {/* Timer */}
            {(recorder.state === recorder.STATES.RECORDING || recorder.state === recorder.STATES.REVIEW) && (
              <TimerDisplay elapsed={recorder.elapsed} />
            )}

            {/* Mini chart during recording/review */}
            {(recorder.state === recorder.STATES.RECORDING || recorder.state === recorder.STATES.REVIEW) && (
              <MiniChart samples={recorder.samples} />
            )}

            {/* ── Control Buttons ─────────────────────────────────── */}
            <div className="train-action-buttons">
              {/* IDLE / WAITING_BASELINE: Show START */}
              {(recorder.state === recorder.STATES.IDLE || recorder.state === recorder.STATES.WAITING_BASELINE) && (
                <button
                  className={`train-btn-start ${recorder.baselineStable ? 'ready' : 'disabled'}`}
                  onClick={recorder.start}
                  disabled={!recorder.baselineStable || !recorder.deviceId}
                >
                  <div className="train-btn-start-inner">
                    <span className="train-btn-start-icon">&#9679;</span>
                    <span>START</span>
                  </div>
                </button>
              )}

              {/* RECORDING: Show STOP + LAP */}
              {recorder.state === recorder.STATES.RECORDING && (
                <>
                  <button className="train-btn-stop" onClick={recorder.stop}>
                    <span className="train-recording-dot" />
                    STOP
                  </button>
                  <button className="train-btn-lap" onClick={recorder.lap} disabled={recorder.saving}>
                    LAP
                  </button>
                </>
              )}

              {/* REVIEW: Show Confirm / Relabel / Discard */}
              {recorder.state === recorder.STATES.REVIEW && (
                <>
                  <button
                    className="train-btn-confirm"
                    onClick={() => recorder.confirm()}
                    disabled={recorder.saving}
                  >
                    {recorder.saving ? 'Saving...' : 'Confirm'}
                  </button>
                  <button
                    className="train-btn-discard"
                    onClick={recorder.discard}
                    disabled={recorder.saving}
                  >
                    Discard
                  </button>
                </>
              )}
            </div>

            {/* Error display */}
            {recorder.error && (
              <div className="train-error">{recorder.error}</div>
            )}

            {/* Last saved label */}
            {recorder.lastSavedLabel && recorder.state === recorder.STATES.WAITING_BASELINE && (
              <div className="train-last-saved">
                Saved: {recorder.lastSavedLabel.label_id} ({recorder.lastSavedLabel.event_type})
              </div>
            )}
          </div>
        </div>
      </section>

      {/* ── Section C: Session History ───────────────────────────── */}
      <section className="train-section train-section-history">
        <h2 className="train-section-title">
          Session History
          <span className="train-session-count">{recorder.sessionLabels.length} events</span>
        </h2>
        <SessionHistory labels={recorder.sessionLabels} />
      </section>
    </div>
  );
}
