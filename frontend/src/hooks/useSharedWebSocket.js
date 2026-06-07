import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '@clerk/clerk-react';

const NO_RECONNECT_CODES = new Set([1000, 1011]);

const WebSocketContext = createContext(null);

export const SharedWebSocketProvider = ({ children }) => {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const heartbeatIntervalRef = useRef(null);
  const stableResetTimerRef = useRef(null);
  const connectionAttemptsRef = useRef(0);
  const subscribersRef = useRef(new Set());

  const { getToken } = useAuth();
  const [token, setToken] = useState(null);

  useEffect(() => {
    let mounted = true;
    const fetchToken = async () => {
      try {
        const t = await getToken();
        if (mounted) setToken(t);
      } catch (e) {
        console.error('SharedWS: token fetch error', e);
      }
    };
    fetchToken();
    const interval = setInterval(fetchToken, 50000);
    return () => { mounted = false; clearInterval(interval); };
  }, [getToken]);

  const subscribe = useCallback((handler) => {
    subscribersRef.current.add(handler);
    return () => subscribersRef.current.delete(handler);
  }, []);

  const buildUrl = useCallback(() => {
    const envBase = (process.env.REACT_APP_WS_URL || '').trim();
    let wsUrl;
    if (envBase) {
      wsUrl = `${envBase.replace(/\/$/, '')}/ws/events`;
    } else {
      const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
      wsUrl = `${scheme}://${window.location.host}/ws/events`;
    }
    if (token) wsUrl += `?token=${encodeURIComponent(token)}`;
    return wsUrl;
  }, [token]);

  const sendMessage = useCallback((message) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(typeof message === 'string' ? message : JSON.stringify(message));
      return true;
    }
    return false;
  }, []);

  const connect = useCallback(() => {
    if (!token) return;
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    const wsUrl = buildUrl();
    wsRef.current = new WebSocket(wsUrl);

    wsRef.current.onopen = () => {
      setIsConnected(true);
      stableResetTimerRef.current = setTimeout(() => { connectionAttemptsRef.current = 0; }, 5000);
      heartbeatIntervalRef.current = setInterval(() => {
        sendMessage({ type: 'ping', ts: Date.now() });
      }, 30000);
    };

    wsRef.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'pong') return;
        subscribersRef.current.forEach(handler => {
          try { handler(data); } catch (e) { console.error('WS subscriber error:', e); }
        });
      } catch {
        // non-JSON message, ignore
      }
    };

    wsRef.current.onclose = (event) => {
      setIsConnected(false);
      clearInterval(heartbeatIntervalRef.current);
      clearTimeout(stableResetTimerRef.current);
      heartbeatIntervalRef.current = null;
      stableResetTimerRef.current = null;
      wsRef.current = null;

      if (NO_RECONNECT_CODES.has(event.code) || event.code >= 4000) return;

      connectionAttemptsRef.current += 1;
      const delay = Math.min(3000 * Math.pow(2, connectionAttemptsRef.current - 1), 30000);
      reconnectTimeoutRef.current = setTimeout(connect, delay);
    };

    wsRef.current.onerror = () => {
      wsRef.current?.close();
    };
  }, [token, buildUrl, sendMessage]);

  const disconnect = useCallback(() => {
    clearTimeout(reconnectTimeoutRef.current);
    clearInterval(heartbeatIntervalRef.current);
    clearTimeout(stableResetTimerRef.current);
    reconnectTimeoutRef.current = null;
    heartbeatIntervalRef.current = null;
    stableResetTimerRef.current = null;
    wsRef.current?.close(1000, 'Manual disconnect');
    wsRef.current = null;
    setIsConnected(false);
    connectionAttemptsRef.current = 0;
  }, []);

  useEffect(() => {
    connect();
    return disconnect;
  }, [connect, disconnect]);

  const value = useMemo(() => ({ isConnected, subscribe, sendMessage }), [isConnected, subscribe, sendMessage]);

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useSharedWebSocket = (onMessage) => {
  const ctx = useContext(WebSocketContext);
  const onMessageRef = useRef(onMessage);
  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);

  useEffect(() => {
    if (!ctx) return;
    const handler = (data) => onMessageRef.current?.(data);
    return ctx.subscribe(handler);
  }, [ctx]);

  return { isConnected: ctx?.isConnected ?? false, sendMessage: ctx?.sendMessage };
};
