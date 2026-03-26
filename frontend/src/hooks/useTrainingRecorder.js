import { useState, useRef, useCallback, useEffect } from 'react';
import { trainingService } from '../services/trainingService';

// States: IDLE -> WAITING_BASELINE -> RECORDING -> REVIEW -> IDLE
const STATES = {
  IDLE: 'IDLE',
  WAITING_BASELINE: 'WAITING_BASELINE',
  RECORDING: 'RECORDING',
  REVIEW: 'REVIEW',
};

function generateSessionId() {
  return 'sess_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function useTrainingRecorder() {
  const [state, setState] = useState(STATES.IDLE);
  const [deviceId, setDeviceId] = useState(null);
  const [eventType, setEventType] = useState('vape');
  const [distance, setDistance] = useState(3);
  const [notes, setNotes] = useState('');
  const [metadata, setMetadata] = useState({ intensity: 'medium', environment: 'bathroom', ventilation: 'closed' });

  const [baselineStable, setBaselineStable] = useState(false);
  const [baselineSnapshot, setBaselineSnapshot] = useState(null);
  const [baselineInfo, setBaselineInfo] = useState(null);

  const [startTime, setStartTime] = useState(null);
  const [endTime, setEndTime] = useState(null);
  const [elapsed, setElapsed] = useState(0);

  const [samples, setSamples] = useState([]);
  const [sessionLabels, setSessionLabels] = useState([]);
  const [lastSavedLabel, setLastSavedLabel] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const sessionIdRef = useRef(generateSessionId());
  const timerRef = useRef(null);
  const startTimeRef = useRef(null);
  const baselinePollRef = useRef(null);

  // Poll baseline status when waiting
  useEffect(() => {
    if (state === STATES.WAITING_BASELINE && deviceId) {
      const poll = async () => {
        try {
          const status = await trainingService.getBaselineStatus(deviceId);
          setBaselineStable(status.stable);
          setBaselineInfo(status);
          if (status.stable && status.snapshot) {
            setBaselineSnapshot(status.snapshot);
          }
        } catch (e) {
          // Silently retry
        }
      };
      poll();
      baselinePollRef.current = setInterval(poll, 2000);
      return () => clearInterval(baselinePollRef.current);
    } else {
      clearInterval(baselinePollRef.current);
    }
  }, [state, deviceId]);

  // Timer for recording
  useEffect(() => {
    if (state === STATES.RECORDING) {
      timerRef.current = setInterval(() => {
        if (startTimeRef.current) {
          setElapsed((performance.now() - startTimeRef.current) / 1000);
        }
      }, 100);
      return () => clearInterval(timerRef.current);
    } else {
      clearInterval(timerRef.current);
    }
  }, [state]);

  const selectDevice = useCallback((id) => {
    setDeviceId(id);
    setBaselineStable(false);
    setBaselineSnapshot(null);
    setBaselineInfo(null);
    if (id) {
      setState(STATES.WAITING_BASELINE);
    } else {
      setState(STATES.IDLE);
    }
  }, []);

  const addSample = useCallback((sample) => {
    if (sample.device_id === deviceId || !deviceId) {
      setSamples(prev => [...prev, { ...sample, _received_at: Date.now() }]);
    }
  }, [deviceId]);

  const start = useCallback(() => {
    if (!baselineStable || !deviceId) return;
    const now = new Date();
    setStartTime(now.toISOString());
    startTimeRef.current = performance.now();
    setElapsed(0);
    setSamples([]);
    setError(null);
    setState(STATES.RECORDING);
  }, [baselineStable, deviceId]);

  const stop = useCallback(() => {
    const now = new Date();
    setEndTime(now.toISOString());
    clearInterval(timerRef.current);
    setState(STATES.REVIEW);
  }, []);

  const confirm = useCallback(async (overrides = {}) => {
    setSaving(true);
    setError(null);
    try {
      const labelData = {
        device_id: deviceId,
        event_type: overrides.event_type || eventType,
        start_time_zulu: startTime,
        end_time_zulu: endTime,
        distance_ft: overrides.distance_ft || distance,
        session_id: sessionIdRef.current,
        notes: overrides.notes ?? notes,
        metadata: overrides.metadata || metadata,
        baseline_snapshot: baselineSnapshot || {},
      };
      const saved = await trainingService.createLabel(labelData);
      setLastSavedLabel(saved);
      setSessionLabels(prev => [saved, ...prev]);

      // Reset for next recording
      setSamples([]);
      setStartTime(null);
      setEndTime(null);
      setElapsed(0);
      setBaselineStable(false);
      setState(STATES.WAITING_BASELINE);
    } catch (e) {
      setError(e.response?.data?.detail || e.message);
    } finally {
      setSaving(false);
    }
  }, [deviceId, eventType, startTime, endTime, distance, notes, metadata, baselineSnapshot]);

  const discard = useCallback(() => {
    setSamples([]);
    setStartTime(null);
    setEndTime(null);
    setElapsed(0);
    setBaselineStable(false);
    setError(null);
    setState(STATES.WAITING_BASELINE);
  }, []);

  const lap = useCallback(async () => {
    // Stop current, auto-confirm, start new
    const now = new Date();
    setEndTime(now.toISOString());
    clearInterval(timerRef.current);

    setSaving(true);
    try {
      const labelData = {
        device_id: deviceId,
        event_type: eventType,
        start_time_zulu: startTime,
        end_time_zulu: now.toISOString(),
        distance_ft: distance,
        session_id: sessionIdRef.current,
        notes,
        metadata,
        baseline_snapshot: baselineSnapshot || {},
      };
      const saved = await trainingService.createLabel(labelData);
      setLastSavedLabel(saved);
      setSessionLabels(prev => [saved, ...prev]);
    } catch (e) {
      setError(e.response?.data?.detail || e.message);
    } finally {
      setSaving(false);
    }

    // Immediately start a new recording
    const newStart = new Date();
    setStartTime(newStart.toISOString());
    startTimeRef.current = performance.now();
    setElapsed(0);
    setSamples([]);
    setState(STATES.RECORDING);
  }, [deviceId, eventType, startTime, distance, notes, metadata, baselineSnapshot]);

  return {
    // State
    state,
    deviceId,
    eventType,
    distance,
    notes,
    metadata,
    baselineStable,
    baselineSnapshot,
    baselineInfo,
    startTime,
    endTime,
    elapsed,
    samples,
    sessionLabels,
    lastSavedLabel,
    saving,
    error,
    sessionId: sessionIdRef.current,

    // Setters
    setEventType,
    setDistance,
    setNotes,
    setMetadata,

    // Actions
    selectDevice,
    addSample,
    start,
    stop,
    confirm,
    discard,
    lap,

    // Constants
    STATES,
  };
}
