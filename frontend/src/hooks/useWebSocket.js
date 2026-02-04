import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

// Close codes that should NOT trigger reconnects
const NO_RECONNECT_CODES = new Set([1000, 1008, 1011]);

export const useWebSocket = (url, options = {}) => {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const [error, setError] = useState(null);

  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const heartbeatIntervalRef = useRef(null);
  const stableResetTimerRef = useRef(null);
  const connectionAttemptsRef = useRef(0);

  const {
    onMessage,
    onOpen,
    onClose,
    onError,
    reconnectInterval = 3000,
    maxReconnectAttempts = 5,
    heartbeatInterval = 30000,
    protocols = [],
    queryParams = null,
    enabled = true,
  } = options;

  // Stable memoized values
  const memoProtocols = useMemo(
    () => protocols,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(protocols)]
  );

  const memoQueryParams = useMemo(
    () => queryParams,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify(queryParams)]
  );

  // Callback refs (avoid re-renders)
  const onMessageRef = useRef(onMessage);
  const onOpenRef = useRef(onOpen);
  const onCloseRef = useRef(onClose);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onMessageRef.current = onMessage;
    onOpenRef.current = onOpen;
    onCloseRef.current = onClose;
    onErrorRef.current = onError;
  }, [onMessage, onOpen, onClose, onError]);

  const buildWebSocketUrl = useCallback(() => {
    let wsUrl = '';
    const envBase = (process.env.REACT_APP_WS_URL || '').trim();

    if (envBase) {
      wsUrl = `${envBase.replace(/\/$/, '')}${url}`;
    } else {
      const scheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
      wsUrl = `${scheme}://${window.location.host}${url}`;
    }

    if (memoQueryParams) {
      const params = new URLSearchParams(memoQueryParams);
      const qs = params.toString();
      if (qs) wsUrl += (wsUrl.includes('?') ? '&' : '?') + qs;
    }

    return wsUrl;
  }, [url, memoQueryParams]);

  const sendMessage = useCallback((message) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        typeof message === 'string' ? message : JSON.stringify(message)
      );
      return true;
    }
    return false;
  }, []);

  const sendHeartbeat = useCallback(() => {
    sendMessage({ type: 'ping', ts: Date.now() });
  }, [sendMessage]);

  const connect = useCallback(() => {
    if (!enabled) return;

    // Prevent duplicate sockets
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    const wsUrl = buildWebSocketUrl();
    wsRef.current = new WebSocket(wsUrl, memoProtocols);

    wsRef.current.onopen = (event) => {
      setIsConnected(true);
      setError(null);

      // Reset attempts ONLY if stable for 5s
      stableResetTimerRef.current = setTimeout(() => {
        connectionAttemptsRef.current = 0;
      }, 5000);

      if (heartbeatInterval > 0) {
        heartbeatIntervalRef.current = setInterval(
          sendHeartbeat,
          heartbeatInterval
        );
      }

      onOpenRef.current?.(event);
    };

    wsRef.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setLastMessage(data);
        if (data.type !== 'pong') {
          onMessageRef.current?.(data, event);
        }
      } catch {
        setLastMessage(event.data);
        onMessageRef.current?.(event.data, event);
      }
    };

    wsRef.current.onclose = (event) => {
      setIsConnected(false);

      clearInterval(heartbeatIntervalRef.current);
      clearTimeout(stableResetTimerRef.current);

      heartbeatIntervalRef.current = null;
      stableResetTimerRef.current = null;
      wsRef.current = null;

      onCloseRef.current?.(event);

      if (
        NO_RECONNECT_CODES.has(event.code) ||
        event.code >= 4000
      ) {
        return;
      }

      if (connectionAttemptsRef.current < maxReconnectAttempts) {
        connectionAttemptsRef.current += 1;
        reconnectTimeoutRef.current = setTimeout(
          connect,
          reconnectInterval
        );
      } else {
        setError('Max reconnection attempts reached');
      }
    };

    wsRef.current.onerror = (event) => {
      setError('WebSocket error');
      onErrorRef.current?.(event);
      wsRef.current?.close();
    };
  }, [
    buildWebSocketUrl,
    memoProtocols,
    heartbeatInterval,
    reconnectInterval,
    maxReconnectAttempts,
    sendHeartbeat,
    enabled
  ]);

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
    setError(null);
    connectionAttemptsRef.current = 0;
  }, []);

  useEffect(() => {
    connect();
    return disconnect;
  }, [connect, disconnect]);

  return {
    isConnected,
    lastMessage,
    error,
    sendMessage,
    connect,
    disconnect,
    connectionAttempts: connectionAttemptsRef.current,
  };
};
