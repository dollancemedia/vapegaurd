import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale,
  BarElement, Tooltip,
} from 'chart.js';
import { useOrganization } from '@clerk/clerk-react';
import { useMediaQuery } from 'react-responsive';
import { useDevices } from '../hooks/useDevices';
import api from '../services/api';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip);

// ── Helpers ───────────────────────────────────────────────────────────────────
const normalizeConf = (c) => {
  if (!c && c !== 0) return null;
  return c <= 1 ? Math.round(c * 100) : Math.round(c);
};

const normalizeEvent = (e) => ({
  id:         e._id || e.id || e.event_id || String(Math.random()),
  deviceId:   e.device_id,
  timestamp:  e.timestamp,
  type:       (e.type || e.predicted_class || e.detection_type || e.event_type || 'unknown').toLowerCase(),
  confidence: normalizeConf(e.confidence ?? e.prediction?.confidence),
  pm25:       e.sensor_data?.pm25 ?? e.pm25 ?? null,
});

const isVape      = (e) => e.type === 'vape'  || e.type === 'alarm';
const isSuspected = (e) => e.type === 'suspected' || e.type === 'confirming';
const isIncident  = (e) => isVape(e) || isSuspected(e);

const fmtDate = (ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const fmtTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// ── Generate time-bucketed chart data ─────────────────────────────────────────
const generateBuckets = (rangeKey, events) => {
  if (rangeKey === 'all') {
    const map = {};
    events.forEach(e => {
      const d  = new Date(e.timestamp);
      const k  = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const lb = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      if (!map[k]) map[k] = { label: lb, count: 0 };
      map[k].count++;
    });
    const sorted = Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
    return { labels: sorted.map(([, v]) => v.label), counts: sorted.map(([, v]) => v.count) };
  }
  const days = rangeKey === '7d' ? 7 : rangeKey === '30d' ? 30 : 90;
  const bucket = {};
  const labels = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const k = d.toISOString().slice(0, 10);
    bucket[k] = 0;
    labels.push(days <= 7
      ? d.toLocaleDateString('en-US', { weekday: 'short' })
      : days <= 30
        ? d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
        : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
  }
  events.forEach(e => {
    const k = new Date(e.timestamp).toISOString().slice(0, 10);
    if (k in bucket) bucket[k]++;
  });
  return { labels, counts: Object.values(bucket) };
};

// ── Range helper ──────────────────────────────────────────────────────────────
const getRangeMs = (key) => {
  if (key === 'all') return 0;
  const d = { '7d': 7, '30d': 30, '90d': 90 }[key];
  return Date.now() - d * 86400000;
};

// ── Sort helper ───────────────────────────────────────────────────────────────
const sortEvents = (arr, col, dir) => {
  return [...arr].sort((a, b) => {
    let av = a[col], bv = b[col];
    if (col === 'timestamp') { av = new Date(av); bv = new Date(bv); }
    if (col === 'confidence') { av = av ?? -1; bv = bv ?? -1; }
    if (av < bv) return dir === 'asc' ? -1 : 1;
    if (av > bv) return dir === 'asc' ? 1 : -1;
    return 0;
  });
};

// ── Components ────────────────────────────────────────────────────────────────
const KpiTile = ({ label, value, sub, color, trend, compact }) => (
  <div style={{
    background: 'var(--card-bg)', borderRadius: compact ? 14 : 18,
    border: '1px solid var(--card-border)', boxShadow: 'var(--shadow-card)',
    backdropFilter: 'blur(20px)', padding: compact ? '14px 14px' : '18px 20px',
  }}>
    <div style={{ fontSize: '0.62rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: compact ? 4 : 6 }}>
      {label}
    </div>
    <div style={{ fontFamily: 'var(--font-display)', fontSize: compact ? '1.6rem' : '2.1rem', fontWeight: 800, color: color || '#1a1a1a', lineHeight: 1, marginBottom: 4 }}>
      {value}
    </div>
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {trend != null && (
        <span style={{
          fontSize: '0.62rem', fontWeight: 700,
          color: trend === 0 ? '#9ca3af' : trend > 0 ? '#ef4444' : '#22c55e',
          background: trend === 0 ? 'rgba(0,0,0,0.05)' : trend > 0 ? 'rgba(239,68,68,0.09)' : 'rgba(34,197,94,0.09)',
          borderRadius: 6, padding: '1px 5px',
        }}>
          {trend > 0 ? `↑ ${trend}%` : trend < 0 ? `↓ ${Math.abs(trend)}%` : '—'} vs prior
        </span>
      )}
      {sub && !trend && (
        <span style={{ fontSize: compact ? '0.62rem' : '0.7rem', color: '#9ca3af' }}>{sub}</span>
      )}
    </div>
  </div>
);

// Hour-of-day heatmap — the signature element of this page
const HourHeatmap = ({ byHour, isMobile }) => {
  const maxVal = Math.max(...byHour, 1);
  const label  = (h) => h === 0 ? '12a' : h === 12 ? '12p' : h < 12 ? `${h}a` : `${h - 12}p`;

  const HeatCell = ({ h }) => {
    const count   = byHour[h];
    const pct     = count / maxVal;
    const isEmpty = count === 0;
    const isHeavy = pct >= 0.6;
    return (
      <div title={`${label(h)} — ${count} incident${count !== 1 ? 's' : ''}`} style={{
        height: isMobile ? 36 : 44, borderRadius: 6, position: 'relative',
        background: isEmpty ? 'rgba(0,0,0,0.04)' : `rgba(0,194,203,${0.12 + pct * 0.78})`,
        border: isEmpty ? '1px solid rgba(0,0,0,0.06)' : `1px solid rgba(0,194,203,${0.15 + pct * 0.35})`,
        transition: 'opacity 0.15s',
      }}>
        {count > 0 && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: isMobile ? '0.55rem' : '0.62rem', fontWeight: 800,
            color: isHeavy ? 'white' : '#007a83',
          }}>
            {count}
          </div>
        )}
      </div>
    );
  };

  if (isMobile) {
    // Two rows: AM (0–11) and PM (12–23)
    const amHours = Array.from({ length: 12 }, (_, h) => h);
    const pmHours = Array.from({ length: 12 }, (_, h) => h + 12);
    const RowLabel = ({ text }) => (
      <div style={{ fontSize: '0.6rem', fontWeight: 700, color: '#9ca3af', width: 22, flexShrink: 0, paddingTop: 10 }}>{text}</div>
    );
    const renderRow = (hours) => (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: 3 }}>
        {hours.map(h => <HeatCell key={h} h={h} />)}
      </div>
    );
    const renderTicks = (hours) => (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(12,1fr)', gap: 3, marginBottom: 8 }}>
        {hours.map(h => (
          <div key={h} style={{ textAlign: 'center', fontSize: '0.52rem', color: h % 3 === 0 ? '#9ca3af' : 'transparent' }}>
            {label(h)}
          </div>
        ))}
      </div>
    );
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          <RowLabel text="AM" />
          <div style={{ flex: 1 }}>{renderRow(amHours)}{renderTicks(amHours)}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start' }}>
          <RowLabel text="PM" />
          <div style={{ flex: 1 }}>{renderRow(pmHours)}{renderTicks(pmHours)}</div>
        </div>
      </div>
    );
  }

  // Desktop: single row of 24
  const hours = Array.from({ length: 24 }, (_, h) => h);
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(24,1fr)', gap: 4, marginBottom: 5 }}>
        {hours.map(h => <HeatCell key={h} h={h} />)}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(24,1fr)', gap: 4 }}>
        {hours.map(h => (
          <div key={h} style={{
            textAlign: 'center', fontSize: '0.53rem',
            fontWeight: h % 6 === 0 ? 700 : 400,
            color: h % 6 === 0 ? '#9ca3af' : '#c4cad4',
          }}>
            {h % 3 === 0 ? label(h) : ''}
          </div>
        ))}
      </div>
    </div>
  );
};

// Type badge
const TypeBadge = ({ type }) => {
  const v = isVape({ type });
  const s = isSuspected({ type });
  if (!v && !s) return <span style={{ fontSize: '0.65rem', color: '#9ca3af' }}>{type}</span>;
  return (
    <span style={{
      fontSize: '0.62rem', fontWeight: 700, letterSpacing: '0.05em',
      textTransform: 'uppercase', borderRadius: 6, padding: '2px 7px',
      color: v ? '#ef4444' : '#f97316',
      background: v ? 'rgba(239,68,68,0.1)' : 'rgba(249,115,22,0.1)',
    }}>
      {v ? 'Vape' : 'Suspected'}
    </span>
  );
};

// Confidence chip
const ConfChip = ({ value }) => {
  if (value == null) return <span style={{ color: '#b0b8c4', fontSize: '0.78rem' }}>—</span>;
  const color = value >= 90 ? '#ef4444' : value >= 70 ? '#f97316' : '#9ca3af';
  return (
    <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.88rem', color }}>
      {value}%
    </span>
  );
};

// Sort header button
const Th = ({ label, col, sortCol, sortDir, onSort }) => {
  const active = sortCol === col;
  return (
    <th
      onClick={() => onSort(col)}
      style={{
        padding: '10px 14px', textAlign: 'left', cursor: 'pointer',
        fontSize: '0.62rem', fontWeight: 700, color: active ? 'var(--teal)' : '#9ca3af',
        textTransform: 'uppercase', letterSpacing: '0.08em',
        userSelect: 'none', whiteSpace: 'nowrap',
        borderBottom: '1px solid rgba(0,0,0,0.07)',
      }}
    >
      {label}
      {active && <span style={{ marginLeft: 4, fontSize: '0.6rem' }}>{sortDir === 'asc' ? '↑' : '↓'}</span>}
    </th>
  );
};

// ── Main page ─────────────────────────────────────────────────────────────────
const Analytics = () => {
  const isMobile = useMediaQuery({ maxWidth: 768 });
  const { organization } = useOrganization();
  const school = (organization?.name === 'admin' || organization?.slug === 'admin') ? 'admin' : organization?.id;
  const { devices } = useDevices(school);

  const [events,      setEvents]      = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [range,       setRange]       = useState('30d');
  const [typeFilter,  setTypeFilter]  = useState('all');   // all | vape | suspected
  const [search,      setSearch]      = useState('');
  const [sortCol,     setSortCol]     = useState('timestamp');
  const [sortDir,     setSortDir]     = useState('desc');
  const [page,        setPage]        = useState(0);
  const PAGE_SIZE = 25;

  // ── Fetch events ────────────────────────────────────────────────────────────
  const fetchEvents = useCallback(async () => {
    try {
      const res = await api.get('/events');
      const raw = res.data;
      const arr = Array.isArray(raw) ? raw : (raw?.events || raw?.data || []);
      setEvents(arr.map(normalizeEvent).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
    } catch (err) {
      console.error('Analytics events fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEvents();
    const t = setInterval(fetchEvents, 60000);
    return () => clearInterval(t);
  }, [fetchEvents]);

  // Device lookup
  const deviceMap  = useMemo(() => Object.fromEntries(devices.map(d => [d.id, d])), [devices]);
  const devName    = (id) => deviceMap[id]?.name || id || '—';
  const devLoc     = (id) => {
    const d = deviceMap[id];
    if (!d) return null;
    return [d.location?.building, d.location?.room].filter(Boolean).join(' · ') || null;
  };

  // ── Filter to selected range ─────────────────────────────────────────────────
  const rangeStart   = getRangeMs(range);
  const rangeEvents  = useMemo(() => events.filter(e => new Date(e.timestamp) >= rangeStart), [events, rangeStart]);
  const incidents    = useMemo(() => rangeEvents.filter(isIncident), [rangeEvents]);

  // Previous period for trend
  const prevIncidents = useMemo(() => {
    if (range === 'all') return [];
    const ms  = Date.now() - getRangeMs(range);
    const pStart = getRangeMs(range) - ms;
    return events.filter(e => {
      const t = new Date(e.timestamp).getTime();
      return t >= pStart && t < getRangeMs(range) && isIncident({ type: e.type });
    });
  }, [events, range]);

  // ── KPIs ────────────────────────────────────────────────────────────────────
  const totalIncidents = incidents.length;
  const trend = prevIncidents.length > 0
    ? Math.round(((totalIncidents - prevIncidents.length) / prevIncidents.length) * 100)
    : null;

  const confVals  = incidents.map(e => e.confidence).filter(c => c != null);
  const avgConf   = confVals.length > 0 ? Math.round(confVals.reduce((s, v) => s + v, 0) / confVals.length) : null;

  const hotspotMap = useMemo(() => {
    const map = {};
    incidents.forEach(e => {
      const loc = devLoc(e.deviceId) || devName(e.deviceId);
      map[loc] = (map[loc] || 0) + 1;
    });
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidents]);
  const hotspot = Object.entries(hotspotMap).sort(([, a], [, b]) => b - a)[0];

  const byHour = useMemo(() => {
    const arr = Array(24).fill(0);
    incidents.forEach(e => { if (e.timestamp) arr[new Date(e.timestamp).getHours()]++; });
    return arr;
  }, [incidents]);
  const peakHour   = byHour.indexOf(Math.max(...byHour));
  const peakLabel  = (h) => h === 0 ? '12:00 AM' : h < 12 ? `${h}:00 AM` : h === 12 ? '12:00 PM' : `${h - 12}:00 PM`;

  // Top locations
  const topLocs = useMemo(() => Object.entries(hotspotMap).sort(([, a], [, b]) => b - a).slice(0, 7), [hotspotMap]);
  const topLocMax = topLocs[0]?.[1] || 1;

  // ── Chart data ──────────────────────────────────────────────────────────────
  const { labels: barLabels, counts: barCounts } = useMemo(
    () => generateBuckets(range, incidents), [range, incidents]
  );
  const maxCount = Math.max(...barCounts, 1);

  const barData = {
    labels: barLabels,
    datasets: [{
      data: barCounts,
      backgroundColor: barCounts.map(c => c === 0 ? 'rgba(0,0,0,0.05)' : c >= maxCount * 0.7 ? 'rgba(239,68,68,0.72)' : 'rgba(0,194,203,0.65)'),
      borderRadius: 5,
      borderSkipped: false,
    }],
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        backgroundColor: 'rgba(13,18,28,0.9)',
        titleColor: 'rgba(255,255,255,0.45)',
        bodyColor: 'white',
        bodyFont: { family: 'DM Sans, sans-serif', weight: '700', size: 13 },
        padding: 10, cornerRadius: 8,
        callbacks: {
          title: (ctx) => ctx[0].label,
          label: (ctx) => ` ${ctx.parsed.y} incident${ctx.parsed.y !== 1 ? 's' : ''}`,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: { font: { size: 10, family: 'DM Sans, sans-serif' }, color: '#b0b8c4',
          maxTicksLimit: range === '90d' ? 12 : range === '30d' ? 10 : 7,
        },
      },
      y: {
        grid: { color: 'rgba(0,0,0,0.05)', drawBorder: false },
        border: { display: false },
        ticks: { font: { size: 10, family: 'DM Sans, sans-serif' }, color: '#b0b8c4', precision: 0 },
        beginAtZero: true,
      },
    },
  };

  // ── Incident log ─────────────────────────────────────────────────────────────
  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
    setPage(0);
  };

  const logFiltered = useMemo(() => {
    let arr = incidents;
    if (typeFilter === 'vape')      arr = arr.filter(isVape);
    if (typeFilter === 'suspected') arr = arr.filter(isSuspected);
    if (search.trim()) {
      const q = search.toLowerCase();
      arr = arr.filter(e =>
        devName(e.deviceId).toLowerCase().includes(q) ||
        (devLoc(e.deviceId) || '').toLowerCase().includes(q)
      );
    }
    return sortEvents(arr, sortCol, sortDir);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incidents, typeFilter, search, sortCol, sortDir]);

  const paginated = logFiltered.slice(0, (page + 1) * PAGE_SIZE);

  // ── Shared styles ────────────────────────────────────────────────────────────
  const card = {
    background: 'var(--card-bg)', borderRadius: 20,
    border: '1px solid var(--card-border)', boxShadow: 'var(--shadow-card)',
    backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
    overflow: 'hidden',
  };
  const sectionHead = {
    fontSize: '0.65rem', fontWeight: 800, color: '#9ca3af',
    textTransform: 'uppercase', letterSpacing: '0.09em',
  };

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: isMobile ? '18px 14px 52px' : '28px 28px 60px', maxWidth: 1280, margin: '0 auto', fontFamily: 'var(--font-body)' }}>

      {/* ── Page header ──────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        marginBottom: isMobile ? 18 : 26,
        flexDirection: isMobile ? 'column' : 'row',
        gap: isMobile ? 12 : undefined,
      }}>
        <div>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: isMobile ? '1.4rem' : '1.7rem', color: '#1a1a1a', margin: 0, letterSpacing: '-0.02em' }}>
            Incident Analytics
          </h1>
          <p style={{ fontSize: '0.73rem', color: '#9ca3af', marginTop: 4, margin: '4px 0 0' }}>
            Historical vape detection record
          </p>
        </div>

        {/* Range selector */}
        <div style={{ display: 'flex', gap: 4, background: 'var(--card-bg)', borderRadius: 14, border: '1px solid var(--card-border)', padding: 4, boxShadow: 'var(--shadow-card)', alignSelf: isMobile ? 'flex-start' : undefined }}>
          {[['7d','7D'],['30d','30D'],['90d','90D'],['all','All']].map(([k, lb]) => (
            <button key={k} onClick={() => { setRange(k); setPage(0); }} style={{
              padding: isMobile ? '6px 11px' : '6px 14px', borderRadius: 10, border: 'none',
              background: range === k ? 'var(--teal)' : 'transparent',
              color: range === k ? 'white' : '#6b7280',
              fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '0.78rem',
              cursor: 'pointer', transition: 'all 0.15s',
              boxShadow: range === k ? '0 2px 8px rgba(0,194,203,0.3)' : 'none',
            }}>
              {lb}
            </button>
          ))}
        </div>
      </div>

      {/* ── KPI strip ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2,1fr)' : 'repeat(4,1fr)', gap: isMobile ? 10 : 14, marginBottom: isMobile ? 14 : 22 }}>
        <KpiTile compact={isMobile}
          label="Total Incidents" value={totalIncidents}
          trend={trend}
          color={totalIncidents > 0 ? '#ef4444' : '#22c55e'}
        />
        <KpiTile compact={isMobile}
          label="Avg Confidence" value={avgConf != null ? `${avgConf}%` : '—'}
          sub={avgConf != null ? (avgConf >= 90 ? 'High reliability' : avgConf >= 70 ? 'Moderate' : 'Low') : 'No detections'}
          color={avgConf != null ? (avgConf >= 85 ? '#00C2CB' : '#f97316') : '#9ca3af'}
        />
        <KpiTile compact={isMobile}
          label="Peak Hour"
          value={byHour[peakHour] > 0 ? peakLabel(peakHour) : '—'}
          sub={byHour[peakHour] > 0 ? `${byHour[peakHour]} incident${byHour[peakHour] !== 1 ? 's' : ''}` : 'No incidents'}
          color="#8b5cf6"
        />
        <KpiTile compact={isMobile}
          label="Top Hotspot"
          value={hotspot ? hotspot[1] : '—'}
          sub={hotspot ? hotspot[0] : 'No incidents'}
          color="#f97316"
        />
      </div>

      {/* ── Frequency chart ──────────────────────────────────────────────────── */}
      <div style={{ ...card, padding: isMobile ? '16px 14px 14px' : '20px 22px 18px', marginBottom: isMobile ? 12 : 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
          <div>
            <span style={sectionHead}>Detection Frequency</span>
            {!isMobile && (
              <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: '3px 0 0' }}>
                Incidents over time · red bars indicate high-activity days
              </p>
            )}
          </div>
          {totalIncidents === 0 && (
            <span style={{ fontSize: '0.72rem', color: '#22c55e', fontWeight: 600, background: 'rgba(34,197,94,0.08)', borderRadius: 8, padding: '4px 10px' }}>
              No incidents in this period
            </span>
          )}
        </div>
        <div style={{ height: isMobile ? 140 : 180 }}>
          <Bar data={barData} options={barOptions} />
        </div>
      </div>

      {/* ── Hour heatmap + top locations ─────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 300px', gap: isMobile ? 12 : 16, marginBottom: isMobile ? 12 : 16 }}>

        {/* Hour heatmap */}
        <div style={{ ...card, padding: isMobile ? '16px 14px' : '20px 22px' }}>
          <div style={{ marginBottom: 14 }}>
            <span style={sectionHead}>Incident Hour-of-Day Pattern</span>
            {!isMobile && (
              <p style={{ fontSize: '0.72rem', color: '#9ca3af', margin: '3px 0 0' }}>
                When does vaping occur? · cell intensity = incident count
              </p>
            )}
          </div>
          {incidents.length > 0 ? (
            <HourHeatmap byHour={byHour} isMobile={isMobile} />
          ) : (
            <div style={{ height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#b0b8c4', fontSize: '0.8rem' }}>
              No incidents to display
            </div>
          )}
        </div>

        {/* Top locations */}
        <div style={{ ...card, padding: isMobile ? '16px 14px' : '20px 22px' }}>
          <span style={{ ...sectionHead, display: 'block', marginBottom: 14 }}>Top Locations</span>
          {topLocs.length === 0 ? (
            <div style={{ color: '#b0b8c4', fontSize: '0.8rem', padding: '20px 0', textAlign: 'center' }}>No incident data</div>
          ) : topLocs.map(([loc, count], i) => (
            <div key={loc} style={{ marginBottom: i < topLocs.length - 1 ? 12 : 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: '0.76rem', fontWeight: 600, color: '#1a1a1a', maxWidth: '75%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {loc}
                </span>
                <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '0.82rem', color: i === 0 ? '#ef4444' : '#6b7280' }}>
                  {count}
                </span>
              </div>
              <div style={{ height: 4, background: 'rgba(0,0,0,0.06)', borderRadius: 2 }}>
                <div style={{
                  height: '100%', borderRadius: 2,
                  width: `${(count / topLocMax) * 100}%`,
                  background: i === 0 ? '#ef4444' : i === 1 ? '#f97316' : 'var(--teal)',
                  transition: 'width 0.4s ease',
                }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Incident log ─────────────────────────────────────────────────────── */}
      <div style={{ ...card }}>

        {/* Log header */}
        <div style={{
          padding: isMobile ? '14px 14px 12px' : '18px 22px 14px',
          borderBottom: '1px solid rgba(0,0,0,0.06)',
          display: 'flex', alignItems: isMobile ? 'flex-start' : 'center',
          gap: 10, flexWrap: 'wrap',
          flexDirection: isMobile ? 'column' : 'row',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <span style={sectionHead}>Incident Log</span>
            <span style={{ marginLeft: 10, fontSize: '0.7rem', color: '#9ca3af' }}>
              {logFiltered.length} records
            </span>
          </div>

          {/* Search + filter row on mobile */}
          <div style={{ display: 'flex', gap: 8, width: isMobile ? '100%' : undefined, flexWrap: 'wrap' }}>
            {/* Search */}
            <div style={{ position: 'relative', flex: isMobile ? 1 : undefined }}>
              <svg style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#b0b8c4', pointerEvents: 'none' }}
                width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input
                type="text" placeholder="Search…"
                value={search} onChange={e => { setSearch(e.target.value); setPage(0); }}
                style={{
                  paddingLeft: 30, paddingRight: 12, height: 32,
                  background: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.08)',
                  borderRadius: 10, fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: '#1a1a1a',
                  outline: 'none', width: isMobile ? '100%' : 210,
                  boxSizing: 'border-box',
                }}
              />
            </div>

            {/* Type filter */}
            <div style={{ display: 'flex', gap: 4 }}>
              {[['all','All'],['vape','Vape'],['suspected','Suspected']].map(([k, lb]) => (
                <button key={k} onClick={() => { setTypeFilter(k); setPage(0); }} style={{
                  padding: '5px 10px', borderRadius: 8,
                  background: typeFilter === k ? 'rgba(0,194,203,0.12)' : 'rgba(0,0,0,0.05)',
                  color: typeFilter === k ? 'var(--teal)' : '#6b7280',
                  fontFamily: 'var(--font-body)', fontSize: '0.72rem',
                  fontWeight: typeFilter === k ? 700 : 500,
                  cursor: 'pointer', transition: 'all 0.15s',
                  border: typeFilter === k ? '1px solid rgba(0,194,203,0.28)' : '1px solid transparent',
                  whiteSpace: 'nowrap',
                }}>{lb}</button>
              ))}
            </div>
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#b0b8c4', fontSize: '0.84rem' }}>
            Loading incident data…
          </div>
        ) : logFiltered.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: 10 }}>✅</div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: '1.1rem', color: '#22c55e', marginBottom: 6 }}>
              No Incidents Recorded
            </div>
            <div style={{ fontSize: '0.78rem', color: '#b0b8c4' }}>
              {search || typeFilter !== 'all' ? 'Try adjusting your filters' : `No incidents in the selected ${range === 'all' ? 'time range' : range} period`}
            </div>
          </div>
        ) : (
          <>
            {isMobile ? (
              /* ── Mobile: card list ── */
              <div style={{ padding: '6px 0' }}>
                {paginated.map((ev, i) => (
                  <div key={ev.id} style={{
                    padding: '12px 14px',
                    borderBottom: i < paginated.length - 1 ? '1px solid rgba(0,0,0,0.055)' : 'none',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.82rem', color: '#1a1a1a' }}>{devName(ev.deviceId)}</div>
                        <div style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: 1 }}>{devLoc(ev.deviceId) || '—'}</div>
                      </div>
                      <TypeBadge type={ev.type} />
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div>
                        <div style={{ fontSize: '0.72rem', color: '#6b7280' }}>{fmtDate(ev.timestamp)}</div>
                        <div style={{ fontSize: '0.65rem', color: '#b0b8c4' }}>{fmtTime(ev.timestamp)}</div>
                      </div>
                      <ConfChip value={ev.confidence} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* ── Desktop: full table ── */
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'rgba(0,0,0,0.018)' }}>
                      <Th label="Date / Time" col="timestamp" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.62rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid rgba(0,0,0,0.07)', whiteSpace: 'nowrap' }}>Device</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.62rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid rgba(0,0,0,0.07)', whiteSpace: 'nowrap' }}>Location</th>
                      <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '0.62rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid rgba(0,0,0,0.07)', whiteSpace: 'nowrap' }}>Type</th>
                      <Th label="Confidence" col="confidence" sortCol={sortCol} sortDir={sortDir} onSort={handleSort} />
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map((ev, i) => (
                      <tr
                        key={ev.id}
                        style={{ borderBottom: i < paginated.length - 1 ? '1px solid rgba(0,0,0,0.045)' : 'none', transition: 'background 0.12s' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,0,0,0.018)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                          <div style={{ fontWeight: 600, fontSize: '0.8rem', color: '#1a1a1a' }}>{fmtDate(ev.timestamp)}</div>
                          <div style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: 1 }}>{fmtTime(ev.timestamp)}</div>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{ fontWeight: 600, fontSize: '0.82rem', color: '#1a1a1a' }}>{devName(ev.deviceId)}</span>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>{devLoc(ev.deviceId) || '—'}</span>
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <TypeBadge type={ev.type} />
                        </td>
                        <td style={{ padding: '12px 14px' }}>
                          <ConfChip value={ev.confidence} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Load more */}
            {paginated.length < logFiltered.length && (
              <div style={{ padding: '14px', textAlign: 'center', borderTop: '1px solid rgba(0,0,0,0.05)' }}>
                <button
                  onClick={() => setPage(p => p + 1)}
                  style={{
                    padding: '8px 24px', background: 'rgba(0,194,203,0.07)',
                    border: '1px solid rgba(0,194,203,0.2)', borderRadius: 10,
                    color: 'var(--teal)', fontFamily: 'var(--font-body)',
                    fontWeight: 600, fontSize: '0.78rem', cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(0,194,203,0.13)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'rgba(0,194,203,0.07)'}
                >
                  Load more · {logFiltered.length - paginated.length} remaining
                </button>
              </div>
            )}
            {paginated.length >= logFiltered.length && logFiltered.length > 0 && (
              <div style={{ padding: '10px', textAlign: 'center', borderTop: '1px solid rgba(0,0,0,0.05)', fontSize: '0.65rem', color: '#c4cad4' }}>
                All {logFiltered.length} incidents shown
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Analytics;
