import React, { useState, useEffect } from 'react';
import { Line } from 'react-chartjs-2';
import { deviceService } from '../services/deviceService';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

// ── Formatters ────────────────────────────────────────────────────────────────
const toF   = (c) => (c != null ? ((c * 9) / 5 + 32).toFixed(1) : '--');
const fmtGas = (v) => { const n = Number(v || 0); return n > 1000 ? (n / 1000).toFixed(1) : n.toFixed(1); };
const fmtTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// ── Status resolver ───────────────────────────────────────────────────────────
const getStatus = (device) => {
  const cls = device.sensorData?.predictedClass;
  const st  = device.status;
  if (st === 'offline')                           return { color: '#9ca3af', bg: '#f9fafb',              label: 'Offline',         sub: 'Device not responding',    icon: 'offline'  };
  if (cls === 'vape' || st === 'alarm')           return { color: '#ef4444', bg: 'rgba(239,68,68,0.06)', label: 'Vape Detected',   sub: 'Immediate action required', icon: 'alarm'    };
  if (st === 'CONFIRMING' || cls === 'suspected') return { color: '#f59e0b', bg: 'rgba(245,158,11,0.06)',label: 'Suspected Event', sub: 'Analysing sensor data',    icon: 'warning'  };
  if (st === 'WARMUP')                            return { color: '#8b5cf6', bg: 'rgba(139,92,246,0.06)',label: 'Warming Up',      sub: 'Device initialising',      icon: 'warmup'   };
  if (st === 'CALIBRATING')                       return { color: '#8b5cf6', bg: 'rgba(139,92,246,0.06)',label: 'Calibrating',     sub: 'Establishing baseline',    icon: 'warmup'   };
  if (st === 'COOLDOWN')                          return { color: '#3b82f6', bg: 'rgba(59,130,246,0.06)',label: 'Cooldown',        sub: 'Recovery period active',   icon: 'cooldown' };
  return                                                 { color: '#00C2CB', bg: 'rgba(0,194,203,0.05)', label: 'Normal',          sub: 'Air quality normal',        icon: 'ok'       };
};

// ── Inline SVG icons ──────────────────────────────────────────────────────────
const PATHS = {
  close:   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}   d="M6 18L18 6M6 6l12 12" />,
  edit:    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}   d="M15.232 5.232l3.536 3.536M9 13h3l8.5-8.5a2.121 2.121 0 00-3-3L9 10v3z" />,
  trash:   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}   d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M4 7h16M10 3h4a1 1 0 011 1v1H9V4a1 1 0 011-1z" />,
  refresh: <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}   d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />,
  check:   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />,
  warn:    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}   d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />,
  drop:    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}   d="M12 3C12 3 5 10.5 5 15a7 7 0 0014 0c0-4.5-7-12-7-12z" />,
  smoke:   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}   d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />,
  thermo:  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}   d="M9 3v10.17A4 4 0 0012 21a4 4 0 003-6.83V3a3 3 0 00-6 0z" />,
  atom:    <><circle cx="12" cy="12" r="2" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.41 1.41m11.32 11.32l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></>,
  wifi:    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}   d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />,
  back:    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M19 12H5m7-7l-7 7 7 7" />,
};

const Ic = ({ name, size = 20, color = 'currentColor' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}>{PATHS[name]}</svg>
);

// ── Confidence ring ───────────────────────────────────────────────────────────
const Ring = ({ value = 0, color = '#00C2CB', size = 58 }) => {
  const r = size * 0.362, circ = 2 * Math.PI * r, dash = (value / 100) * circ;
  const cx = size / 2, cy = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="4.5" />
      <circle cx={cx} cy={cy} r={r} fill="none" stroke={color}
        strokeWidth="4.5" strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{ transform: 'rotate(-90deg)', transformOrigin: `${cx}px ${cy}px`, transition: 'stroke-dasharray 0.5s ease' }} />
      <text x={cx} y={cy + 4} textAnchor="middle" fontSize={size * 0.18} fontWeight="700" fill={color}
        style={{ fontFamily: 'var(--font-body)' }}>{value}%</text>
    </svg>
  );
};

// ── Status icon chip ──────────────────────────────────────────────────────────
const StatusChip = ({ icon, color, size = 40 }) => {
  const map = { ok: 'check', alarm: 'warn', warning: 'warn', warmup: 'thermo', cooldown: 'drop', offline: 'wifi' };
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: color + '22',
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <Ic name={map[icon] || 'check'} size={size * 0.5} color={color} />
    </div>
  );
};

// ── Metric tabs config ────────────────────────────────────────────────────────
const METRICS = [
  { key: 'pm25',          label: 'PM2.5', unit: 'μg/m³', color: '#ef4444', max: 200 },
  { key: 'humidity',      label: 'Hum',   unit: '%',     color: '#3b82f6', max: 100 },
  { key: 'temperature',   label: 'Temp',  unit: '°F',    color: '#f59e0b', max: 130,
    fn: (v) => v != null ? parseFloat(toF(v)) : null },
  { key: 'gasResistance', label: 'Gas',   unit: 'kΩ',   color: '#10b981', max: 70,
    fn: (v) => { if (v == null || v === '' || v === -999) return null; const n = Number(v); return n > 1000 ? n / 1000 : n; } },
];

// ── Delta baseline bar ────────────────────────────────────────────────────────
const DeltaBar = ({ current, baseline, max, color, inverse }) => {
  const pct  = Math.min((current / max) * 100, 100);
  const bPct = baseline != null ? Math.min((baseline / max) * 100, 100) : null;
  const bad  = inverse ? current < (baseline ?? max) * 0.7 : current > (baseline ?? 0) * 1.6;
  return (
    <div style={{ position: 'relative', height: '3px', background: 'rgba(0,0,0,0.07)',
      borderRadius: 2, marginTop: 7, overflow: 'visible' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: bad ? '#ef4444' : color,
        borderRadius: 2, transition: 'width 0.4s ease' }} />
      {bPct !== null && (
        <div style={{ position: 'absolute', left: `${bPct}%`, top: -2, width: 2, height: 7,
          background: 'rgba(0,0,0,0.22)', borderRadius: 1 }} />
      )}
    </div>
  );
};

// ── Shared styles ─────────────────────────────────────────────────────────────
const sCard = {
  background: '#f8fafc',
  borderRadius: 12,
  padding: '12px 14px',
  border: '1px solid rgba(0,0,0,0.06)',
};

const sLabel = {
  fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.09em',
  color: '#9ca3af', fontWeight: 600, fontFamily: 'var(--font-body)',
};

const sBigNum = {
  fontSize: '1.55rem', fontWeight: 700, color: '#111827',
  letterSpacing: '-0.03em', fontFamily: 'var(--font-display)', lineHeight: 1,
};

const sSub = {
  fontSize: '0.62rem', color: '#9ca3af', marginTop: 4, fontFamily: 'var(--font-body)',
};

const sSecBtn = {
  flex: 1, padding: '9px 10px', borderRadius: 10, border: '1px solid rgba(0,0,0,0.1)',
  background: 'white', cursor: 'pointer', fontSize: '0.77rem', fontWeight: 600,
  color: '#374151', display: 'flex', alignItems: 'center', justifyContent: 'center',
  gap: 5, fontFamily: 'var(--font-body)', transition: 'all 0.15s',
};

// ── Chart builder (shared between desktop & mobile) ──────────────────────────
const useChartConfig = (history, metric) => {
  const isAll  = metric === 'all';
  const active = METRICS.find(m => m.key === metric);
  const sliced = history.slice(0, 20).reverse();

  const singleDatasets = active ? [{
    label: `${active.label} (${active.unit})`,
    data:  sliced.map(h => { const v = h[active.key]; return active.fn ? active.fn(v) : v; }),
    borderColor: active.color,
    backgroundColor: (ctx) => {
      const { chart } = ctx;
      const { ctx: c, chartArea } = chart;
      if (!chartArea) return 'transparent';
      const g = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
      g.addColorStop(0, active.color + '48');
      g.addColorStop(1, active.color + '00');
      return g;
    },
    fill: true, tension: 0.42, borderWidth: 2,
    pointRadius: (ctx) => ctx.dataIndex === sliced.length - 1 ? 4 : 2,
    pointBackgroundColor: active.color, pointBorderColor: '#fff',
    pointBorderWidth: 1.5, pointHoverRadius: 5,
  }] : [];

  const allDatasets = METRICS.map(m => ({
    label: m.label,
    data: sliced.map(h => {
      const v   = h[m.key];
      const raw = m.fn ? m.fn(v) : (v != null ? Number(v) : null);
      return raw != null ? Math.min(+(raw / m.max * 100).toFixed(1), 100) : null;
    }),
    borderColor: m.color, backgroundColor: 'transparent',
    fill: false, tension: 0.42, borderWidth: 1.5,
    pointRadius: 2, pointBackgroundColor: m.color,
    pointBorderColor: '#fff', pointBorderWidth: 1, pointHoverRadius: 4,
  }));

  const chartData = {
    labels: sliced.map(h => fmtTime(h.timestamp)),
    datasets: isAll ? allDatasets : singleDatasets,
  };

  const chartOpts = {
    responsive: true,
    maintainAspectRatio: false,
    animation: { duration: 200 },
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: isAll ? {
        display: true, position: 'bottom',
        labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 6, padding: 10, color: '#6b7280',
          font: { size: 9, family: 'var(--font-body)' } },
      } : { display: false },
      tooltip: {
        backgroundColor: '#1f2937', titleColor: '#9ca3af',
        bodyColor: '#f9fafb', padding: 10, cornerRadius: 8,
        callbacks: {
          label: (ctx) => {
            if (isAll) {
              const m = METRICS[ctx.datasetIndex];
              const h = sliced[ctx.dataIndex];
              if (!m || !h) return '';
              const v   = h[m.key];
              const raw = m.fn ? m.fn(v) : (v != null ? Number(v) : null);
              return ` ${m.label}: ${raw?.toFixed(1) ?? '--'} ${m.unit}`;
            }
            return ` ${ctx.parsed.y?.toFixed(2)} ${active?.unit}`;
          },
        },
      },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 9 }, color: '#9ca3af', maxTicksLimit: 6, maxRotation: 0 }, border: { display: false } },
      y: { ...(isAll ? { min: 0, max: 100 } : {}), grid: { color: 'rgba(0,0,0,0.045)' },
        ticks: { font: { size: 9 }, color: '#9ca3af', maxTicksLimit: 4, ...(isAll ? { callback: (v) => v + '%' } : {}) },
        border: { display: false } },
    },
  };

  return { chartData, chartOpts, isAll, active, sliced };
};

// ── Shared content blocks ─────────────────────────────────────────────────────
const StatusBanner = ({ status, sd }) => (
  <div style={{ background: status.bg, borderRadius: 16, padding: '14px 16px',
    marginBottom: 18, border: `1px solid ${status.color}25` }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <StatusChip icon={status.icon} color={status.color} />
        <div>
          <div style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.09em',
            color: status.color, fontWeight: 700, fontFamily: 'var(--font-body)', marginBottom: 2 }}>
            Current Status
          </div>
          <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#111827',
            fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>
            {status.label}
          </div>
          <div style={{ fontSize: '0.72rem', color: '#6b7280', marginTop: 1, fontFamily: 'var(--font-body)' }}>
            {status.sub}
          </div>
        </div>
      </div>
      {sd.confidence !== undefined && <Ring value={sd.confidence} color={status.color} />}
    </div>
  </div>
);

const LiveReadings = ({ sd }) => {
  if (sd.humidity === undefined) return null;
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
        <span style={sLabel}>Live Readings</span>
        {sd.timestamp && (
          <span style={{ fontSize: '0.67rem', color: '#9ca3af', fontFamily: 'var(--font-body)' }}>
            {fmtTime(sd.timestamp)}
          </span>
        )}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {/* Humidity */}
        <div style={sCard}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={sLabel}>Humidity</span>
            <Ic name="drop" size={13} color="#3b82f6" />
          </div>
          <div style={sBigNum}>
            {Number(sd.humidity).toFixed(1)}
            <span style={{ fontSize: '0.72rem', fontWeight: 500, color: '#9ca3af', marginLeft: 2 }}>%</span>
          </div>
          <DeltaBar current={sd.humidity} baseline={sd.baseline_humidity} max={100} color="#3b82f6" />
          {sd.baseline_humidity != null && (
            <div style={sSub}>baseline {Number(sd.baseline_humidity).toFixed(1)}%</div>
          )}
        </div>
        {/* PM2.5 */}
        <div style={sCard}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={sLabel}>PM2.5</span>
            <Ic name="smoke" size={13} color="#ef4444" />
          </div>
          <div style={sBigNum}>
            {sd.pm25}
            <span style={{ fontSize: '0.72rem', fontWeight: 500, color: '#9ca3af', marginLeft: 2 }}>μg/m³</span>
          </div>
          <DeltaBar current={sd.pm25} baseline={sd.baseline_pm25 ?? sd.ewma_pm25} max={150} color="#ef4444" />
          {(sd.baseline_pm25 ?? sd.ewma_pm25) != null && (
            <div style={sSub}>baseline {Number(sd.baseline_pm25 ?? sd.ewma_pm25).toFixed(1)}</div>
          )}
        </div>
        {/* Temp */}
        <div style={sCard}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={sLabel}>Temp</span>
            <Ic name="thermo" size={13} color="#f59e0b" />
          </div>
          <div style={sBigNum}>
            {toF(sd.temperature)}
            <span style={{ fontSize: '0.72rem', fontWeight: 500, color: '#9ca3af', marginLeft: 2 }}>°F</span>
          </div>
          <DeltaBar current={Number(sd.temperature || 0)} baseline={sd.baseline_temperature} max={35} color="#f59e0b" />
          {sd.baseline_temperature != null && (
            <div style={sSub}>baseline {Number(sd.baseline_temperature).toFixed(1)}°C</div>
          )}
        </div>
        {/* Gas Resistance */}
        <div style={sCard}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={sLabel}>Gas Res</span>
            <Ic name="atom" size={13} color="#10b981" />
          </div>
          <div style={sBigNum}>
            {fmtGas(sd.gasResistance)}
            <span style={{ fontSize: '0.72rem', fontWeight: 500, color: '#9ca3af', marginLeft: 2 }}>kΩ</span>
          </div>
          <DeltaBar
            current={Number(sd.gasResistance || 0) > 1000 ? Number(sd.gasResistance) / 1000 : Number(sd.gasResistance || 0)}
            baseline={sd.baseline_gas_resistance ? (Number(sd.baseline_gas_resistance) > 1000 ? Number(sd.baseline_gas_resistance) / 1000 : Number(sd.baseline_gas_resistance)) : null}
            max={70} color="#10b981" inverse
          />
          {sd.baseline_gas_resistance != null && (
            <div style={sSub}>baseline {fmtGas(sd.baseline_gas_resistance)} kΩ</div>
          )}
        </div>
      </div>
    </div>
  );
};

const SensorTrends = ({ history, metric, setMetric, chartData, chartOpts, isAll }) => {
  if (history.length <= 1) return null;
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
        <span style={sLabel}>Sensor Trends</span>
        <div style={{ display: 'flex', gap: 3 }}>
          {[{ key: 'all', label: 'All', color: '#374151' }, ...METRICS].map(m => (
            <button key={m.key} onClick={() => setMetric(m.key)} style={{
              padding: '5px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
              fontSize: '0.72rem', fontWeight: 600, fontFamily: 'var(--font-body)',
              background: metric === m.key ? m.color : 'rgba(0,0,0,0.05)',
              color:      metric === m.key ? '#fff'  : '#6b7280',
              transition: 'all 0.15s',
            }}>
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ height: isAll ? 212 : 170, background: '#f8fafc', borderRadius: 14,
        padding: isAll ? '10px 10px 4px' : '12px 12px 8px',
        border: '1px solid rgba(0,0,0,0.06)', transition: 'height 0.2s ease' }}>
        <Line data={chartData} options={chartOpts} />
      </div>
      {isAll && (
        <p style={{ margin: '5px 0 0', textAlign: 'center', fontSize: '0.6rem',
          color: '#b0b8c4', fontFamily: 'var(--font-body)', letterSpacing: '0.04em' }}>
          chart normalised to % of range · hover for real values
        </p>
      )}
    </div>
  );
};

const logColors = { vape: '#ef4444', suspected: '#f59e0b', normal: '#22c55e', cooldown: '#3b82f6' };
const dotColor  = (cls) => logColors[cls] || '#9ca3af';

const RecentEvents = ({ history }) => {
  if (history.length === 0) return null;
  return (
    <div style={{ marginBottom: 6 }}>
      <span style={{ ...sLabel, display: 'block', marginBottom: 9 }}>Recent Events</span>
      <div style={{ maxHeight: 240, overflowY: 'auto', scrollbarWidth: 'thin',
        scrollbarColor: 'rgba(0,0,0,0.08) transparent' }}>
        {history.slice(0, 14).map((h, i) => {
          const cls   = h.predictedClass || 'normal';
          const dot   = dotColor(cls);
          const label = cls === 'vape' ? 'Vape detected' : cls === 'suspected' ? 'Suspected' : cls === 'cooldown' ? 'Cooldown' : 'Normal';
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9,
              padding: '5px 0', borderBottom: i < Math.min(history.length, 14) - 1 ? '1px solid rgba(0,0,0,0.04)' : 'none' }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: dot, flexShrink: 0 }} />
              <span style={{ fontSize: '0.68rem', color: '#9ca3af', width: 34, flexShrink: 0, fontFamily: 'var(--font-body)' }}>
                {fmtTime(h.timestamp)}
              </span>
              <span style={{ fontSize: '0.74rem', color: '#374151', flex: 1, fontFamily: 'var(--font-body)', fontWeight: 500 }}>
                {label}
              </span>
              <span style={{ fontSize: '0.68rem', color: '#9ca3af', fontFamily: 'var(--font-body)', marginRight: 4 }}>
                {h.pm25} μg/m³
              </span>
              <span style={{ fontSize: '0.65rem', fontWeight: 700, color: dot,
                background: dot + '1a', borderRadius: 4, padding: '1px 5px', fontFamily: 'var(--font-body)', flexShrink: 0 }}>
                {h.confidence}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const EditModal = ({ isEditing, setIsEditing, editForm, setEditForm, handleSave, isMobile }) => {
  if (!isEditing) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex',
      alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center',
      padding: isMobile ? 0 : 16,
      background: 'rgba(0,0,0,0.36)', backdropFilter: 'blur(4px)' }}>
      <div style={{ background: 'white', width: '100%', maxWidth: isMobile ? '100%' : 400,
        overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
        borderRadius: isMobile ? '20px 20px 0 0' : 20 }}>
        <div style={{ padding: '16px 18px 12px', borderBottom: '1px solid rgba(0,0,0,0.07)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '0.92rem', fontWeight: 700, color: '#111827', fontFamily: 'var(--font-display)' }}>
            Edit Device
          </span>
          <button onClick={() => setIsEditing(false)}
            style={{ padding: 5, borderRadius: 7, border: 'none', background: 'transparent',
              cursor: 'pointer', color: '#9ca3af', display: 'flex' }}>
            <Ic name="close" size={17} />
          </button>
        </div>
        <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 11 }}>
          {[{ label: 'Device Name', key: 'name' }, { label: 'Building', key: 'building' },
            { label: 'Floor', key: 'floor' }, { label: 'Room', key: 'room' }].map(({ label, key }) => (
            <div key={key}>
              <label style={{ display: 'block', ...sLabel, marginBottom: 5 }}>{label}</label>
              <input type="text" value={editForm[key]}
                onChange={e => setEditForm(p => ({ ...p, [key]: e.target.value }))}
                style={{ width: '100%', padding: '8px 12px', border: '1px solid rgba(0,0,0,0.12)',
                  borderRadius: 9, fontSize: '0.86rem', color: '#111827',
                  fontFamily: 'var(--font-body)', outline: 'none', transition: 'border-color 0.15s',
                  boxSizing: 'border-box' }}
                onFocus={e => { e.target.style.borderColor = '#00C2CB'; e.target.style.boxShadow = '0 0 0 3px rgba(0,194,203,0.12)'; }}
                onBlur={e  => { e.target.style.borderColor = 'rgba(0,0,0,0.12)'; e.target.style.boxShadow = 'none'; }}
              />
            </div>
          ))}
        </div>
        <div style={{ padding: isMobile ? '10px 18px calc(14px + env(safe-area-inset-bottom, 0px))' : '10px 18px 14px',
          borderTop: '1px solid rgba(0,0,0,0.07)',
          display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={() => setIsEditing(false)}
            style={{ padding: '8px 16px', borderRadius: 9, border: '1px solid rgba(0,0,0,0.1)',
              background: 'white', cursor: 'pointer', fontSize: '0.81rem', fontWeight: 600,
              color: '#374151', fontFamily: 'var(--font-body)' }}>
            Cancel
          </button>
          <button onClick={handleSave}
            style={{ padding: '8px 18px', borderRadius: 9, border: 'none', background: '#00C2CB',
              cursor: 'pointer', fontSize: '0.81rem', fontWeight: 600, color: 'white',
              fontFamily: 'var(--font-body)', boxShadow: '0 2px 8px rgba(0,194,203,0.32)' }}>
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
};


// ══════════════════════════════════════════════════════════════════════════════
//  MOBILE — Inline full-page detail view (replaces dashboard content)
// ══════════════════════════════════════════════════════════════════════════════
export const MobileDeviceDetail = ({ device, onClose, onPingDevice, history = [] }) => {
  const [isEditing,     setIsEditing]     = useState(false);
  const [editForm,      setEditForm]      = useState({ name: '', building: '', floor: '', room: '' });
  const [metric,        setMetric]        = useState('pm25');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [mounted,       setMounted]       = useState(false);

  useEffect(() => { requestAnimationFrame(() => setMounted(true)); }, []);

  useEffect(() => {
    if (device) {
      setEditForm({
        name:     device.name           || '',
        building: device.location?.building || '',
        floor:    device.location?.floor    || '',
        room:     device.location?.room     || '',
      });
    }
  }, [device]);

  useEffect(() => {
    if (!confirmDelete) return;
    const t = setTimeout(() => setConfirmDelete(false), 3000);
    return () => clearTimeout(t);
  }, [confirmDelete]);

  const { chartData, chartOpts, isAll } = useChartConfig(history, metric);

  if (!device) return null;

  const status = getStatus(device);
  const sd     = device.sensorData || {};

  const handleSave = async () => {
    try {
      await deviceService.updateDeviceInfo(device.id, {
        name: editForm.name,
        location: { building: editForm.building, floor: editForm.floor, room: editForm.room },
      });
      setIsEditing(false);
      if (onPingDevice) onPingDevice(device.id);
    } catch { alert('Failed to save changes'); }
  };

  const handleRecalibrate = async () => {
    try {
      if (window.confirm("Reset this device's baseline? Takes ~30 seconds.")) {
        await deviceService.recalibrateDevice(device.id);
        if (onPingDevice) onPingDevice(device.id);
      }
    } catch { alert('Failed to start recalibration'); }
  };

  const handleDelete = async () => {
    try {
      await deviceService.deleteDevice(device.id);
      onClose();
    } catch { alert('Failed to delete device'); }
  };

  return (
    <div style={{
      minHeight: '100vh', background: '#f7f8fa',
      paddingBottom: 'calc(80px + env(safe-area-inset-bottom, 0px))',
      opacity: mounted ? 1 : 0,
      transform: mounted ? 'translateY(0)' : 'translateY(12px)',
      transition: 'opacity 0.3s ease, transform 0.3s ease',
    }}>

      {/* ── Sticky header bar ── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 30,
        background: 'rgba(247,248,250,0.92)', backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        padding: '12px 16px 10px',
        borderBottom: '1px solid rgba(0,0,0,0.06)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onClose} style={{
            width: 36, height: 36, borderRadius: 10,
            border: 'none', background: 'rgba(0,0,0,0.05)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', flexShrink: 0, transition: 'background 0.15s',
          }}>
            <Ic name="back" size={18} color="#374151" />
          </button>

          <div style={{ flex: 1, minWidth: 0 }}>
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#111827',
              fontFamily: 'var(--font-display)', letterSpacing: '-0.02em',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {device.name}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
              {device.location?.building && (
                <span style={{ fontSize: '0.7rem', color: '#6b7280', fontFamily: 'var(--font-body)' }}>
                  {device.location.building}{device.location.room ? ` · ${device.location.room}` : ''}
                </span>
              )}
              {device.location?.floor && (
                <span style={{ fontSize: '0.62rem', background: 'rgba(0,0,0,0.06)', borderRadius: 4,
                  padding: '1px 6px', color: '#6b7280', fontFamily: 'var(--font-body)' }}>
                  Fl {device.location.floor}
                </span>
              )}
            </div>
          </div>

          <button onClick={() => setIsEditing(true)} style={{
            width: 36, height: 36, borderRadius: 10,
            border: 'none', background: 'rgba(0,0,0,0.05)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', flexShrink: 0,
          }}>
            <Ic name="edit" size={16} color="#6b7280" />
          </button>
        </div>
      </div>

      {/* ── Scrollable content ── */}
      <div style={{ padding: '16px 16px 0' }}>
        <StatusBanner status={status} sd={sd} />
        <LiveReadings sd={sd} />
        <SensorTrends history={history} metric={metric} setMetric={setMetric}
          chartData={chartData} chartOpts={chartOpts} isAll={isAll} />
        <RecentEvents history={history} />
      </div>

      {/* ── Bottom action bar ── */}
      <div style={{
        position: 'sticky', bottom: 0, left: 0, right: 0,
        padding: '10px 16px calc(12px + env(safe-area-inset-bottom, 0px))',
        background: 'rgba(247,248,250,0.92)', backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderTop: '1px solid rgba(0,0,0,0.06)',
        display: 'flex', gap: 8, zIndex: 20,
      }}>
        <button onClick={() => setIsEditing(true)}
          style={{ ...sSecBtn, padding: '11px 10px', borderRadius: 12 }}>
          <Ic name="edit" size={14} color="#374151" /> Edit
        </button>
        <button onClick={handleRecalibrate}
          style={{ ...sSecBtn, padding: '11px 10px', borderRadius: 12 }}>
          <Ic name="refresh" size={14} color="#374151" /> Recalibrate
        </button>
        <button
          onClick={() => confirmDelete ? handleDelete() : setConfirmDelete(true)}
          style={{ ...sSecBtn, padding: '11px 10px', borderRadius: 12,
            border:     confirmDelete ? '1px solid #ef4444' : '1px solid rgba(0,0,0,0.1)',
            background: confirmDelete ? '#fef2f2' : 'white',
            color:      confirmDelete ? '#ef4444' : '#374151',
          }}>
          <Ic name="trash" size={14} color={confirmDelete ? '#ef4444' : '#374151'} />
          {confirmDelete ? 'Confirm?' : 'Delete'}
        </button>
      </div>

      <EditModal isEditing={isEditing} setIsEditing={setIsEditing}
        editForm={editForm} setEditForm={setEditForm} handleSave={handleSave} isMobile={true} />
    </div>
  );
};


// ══════════════════════════════════════════════════════════════════════════════
//  DESKTOP — Original slide-over panel (unchanged)
// ══════════════════════════════════════════════════════════════════════════════
const DeviceDetailPanel = ({ device, isOpen, onClose, onPingDevice, history = [] }) => {
  const [isEditing,     setIsEditing]     = useState(false);
  const [editForm,      setEditForm]      = useState({ name: '', building: '', floor: '', room: '' });
  const [metric,        setMetric]        = useState('pm25');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (device) {
      setEditForm({
        name:     device.name           || '',
        building: device.location?.building || '',
        floor:    device.location?.floor    || '',
        room:     device.location?.room     || '',
      });
    }
  }, [device]);

  useEffect(() => {
    if (!confirmDelete) return;
    const t = setTimeout(() => setConfirmDelete(false), 3000);
    return () => clearTimeout(t);
  }, [confirmDelete]);

  if (!device) return null;

  const status = getStatus(device);
  const sd     = device.sensorData || {};
  const { chartData, chartOpts, isAll } = useChartConfig(history, metric);

  const handleSave = async () => {
    try {
      await deviceService.updateDeviceInfo(device.id, {
        name: editForm.name,
        location: { building: editForm.building, floor: editForm.floor, room: editForm.room },
      });
      setIsEditing(false);
      if (onPingDevice) onPingDevice(device.id);
    } catch { alert('Failed to save changes'); }
  };

  const handleRecalibrate = async () => {
    try {
      if (window.confirm("Reset this device's baseline? Takes ~30 seconds.")) {
        await deviceService.recalibrateDevice(device.id);
        if (onPingDevice) onPingDevice(device.id);
      }
    } catch { alert('Failed to start recalibration'); }
  };

  const handleDelete = async () => {
    try {
      await deviceService.deleteDevice(device.id);
      onClose();
    } catch { alert('Failed to delete device'); }
  };

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 40,
            background: 'rgba(0,0,0,0.22)', backdropFilter: 'blur(3px)' }}
          onClick={onClose}
        />
      )}

      {/* Desktop slide-over panel */}
      <div style={{
        position: 'fixed', top: 58, right: 0,
        height: 'calc(100vh - 58px)', width: 460,
        background: '#ffffff',
        boxShadow: '-6px 0 32px rgba(0,0,0,0.10), -1px 0 0 rgba(0,0,0,0.06)',
        zIndex: 900,
        transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>

        {/* Header */}
        <div style={{ padding: '16px 18px 14px', borderBottom: '1px solid rgba(0,0,0,0.07)',
          background: '#fafafa', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <div style={{ width: 42, height: 42, borderRadius: 11, flexShrink: 0,
                background: 'radial-gradient(circle at 38% 32%, #3a3a3a, #141414)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.22)' }}>
                <Ic name="wifi" size={18} color="rgba(0,194,203,0.75)" />
              </div>
              <div>
                <h2 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 700, color: '#111827',
                  fontFamily: 'var(--font-display)', letterSpacing: '-0.02em' }}>
                  {device.name}
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 3 }}>
                  {device.location?.building && (
                    <span style={{ fontSize: '0.71rem', color: '#6b7280', fontFamily: 'var(--font-body)' }}>
                      {device.location.building}{device.location.room ? ` · ${device.location.room}` : ''}
                    </span>
                  )}
                  {device.location?.floor && (
                    <span style={{ fontSize: '0.65rem', background: 'rgba(0,0,0,0.06)', borderRadius: 4,
                      padding: '1px 6px', color: '#6b7280', fontFamily: 'var(--font-body)' }}>
                      Fl {device.location.floor}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {[{ icon: 'edit', action: () => setIsEditing(true) }, { icon: 'close', action: onClose }].map(({ icon, action }) => (
                <button key={icon} onClick={action}
                  style={{ padding: 7, borderRadius: 8, border: 'none', background: 'transparent',
                    cursor: 'pointer', color: '#9ca3af', transition: 'all 0.15s', display: 'flex' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.07)'; e.currentTarget.style.color = '#374151'; }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#9ca3af'; }}>
                  <Ic name={icon} size={16} />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 18px 20px',
          scrollbarWidth: 'thin', scrollbarColor: 'rgba(0,0,0,0.1) transparent' }}>
          <StatusBanner status={status} sd={sd} />
          <LiveReadings sd={sd} />
          <SensorTrends history={history} metric={metric} setMetric={setMetric}
            chartData={chartData} chartOpts={chartOpts} isAll={isAll} />
          <RecentEvents history={history} />
        </div>

        {/* Footer actions */}
        <div style={{ padding: '10px 18px 12px', borderTop: '1px solid rgba(0,0,0,0.07)',
          background: '#fafafa', display: 'flex', gap: 7, flexShrink: 0 }}>
          <button onClick={() => setIsEditing(true)} style={sSecBtn}
            onMouseEnter={e => e.currentTarget.style.background = '#f3f4f6'}
            onMouseLeave={e => e.currentTarget.style.background = 'white'}>
            <Ic name="edit" size={14} color="#374151" /> Edit
          </button>
          <button onClick={handleRecalibrate} style={sSecBtn}
            onMouseEnter={e => e.currentTarget.style.background = '#f3f4f6'}
            onMouseLeave={e => e.currentTarget.style.background = 'white'}>
            <Ic name="refresh" size={14} color="#374151" /> Recalibrate
          </button>
          <button
            onClick={() => confirmDelete ? handleDelete() : setConfirmDelete(true)}
            style={{ ...sSecBtn,
              border:     confirmDelete ? '1px solid #ef4444' : '1px solid rgba(0,0,0,0.1)',
              background: confirmDelete ? '#fef2f2' : 'white',
              color:      confirmDelete ? '#ef4444' : '#374151',
            }}>
            <Ic name="trash" size={14} color={confirmDelete ? '#ef4444' : '#374151'} />
            {confirmDelete ? 'Confirm?' : 'Delete'}
          </button>
        </div>
      </div>

      <EditModal isEditing={isEditing} setIsEditing={setIsEditing}
        editForm={editForm} setEditForm={setEditForm} handleSave={handleSave} isMobile={false} />
    </>
  );
};

export default DeviceDetailPanel;
