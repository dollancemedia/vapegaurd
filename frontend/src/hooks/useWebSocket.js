import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

const NO_RECONNECT_CODES = new Set([1000, 1008, 1011]); 
// 1008 = policy violation (often auth), 1011 server error (optional)
// you can add custom codes like 4001/4401 if your backend uses them

export const useWebSocket = (url, options = {}) => {
  // ... your state/refs

  const stableResetTimerRef = useRef(null);

  const connect = useCallback(() => {
    // Guard: avoid duplicate sockets
    if (
      wsRef.current &&
      (wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    // Clear pending reconnects before creating a new socket
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    try {
      const wsUrl = buildWebSocketUrl();
      wsRef.current = new WebSocket(wsUrl, protocols);

      wsRef.current.onopen = (event) => {
        setIsConnected(true);
        setError(null);

        // IMPORTANT: don't reset attempts immediately.
        // Only reset after it stays open for 5s.
        if (stableResetTimerRef.current) clearTimeout(stableResetTimerRef.current);
        stableResetTimerRef.current = setTimeout(() => {
          connectionAttemptsRef.current = 0;
        }, 5000);

        if (heartbeatInterval > 0) {
          heartbeatIntervalRef.current = setInterval(sendHeartbeat, heartbeatInterval);
        }
        onOpenRef.current?.(event);
      };

      wsRef.current.onclose = (event) => {
        setIsConnected(false);

        if (stableResetTimerRef.current) {
          clearTimeout(stableResetTimerRef.current);
          stableResetTimerRef.current = null;
        }

        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
        }

        onCloseRef.current?.(event);

        // Don’t reconnect on clean/policy closes
        const code = event.code;
        const isNoReconnect =
          NO_RECONNECT_CODES.has(code) || (code >= 4000 && code < 5000); // common custom auth codes

        if (isNoReconnect) return;

        // Reconnect with attempts
        if (connectionAttemptsRef.current < maxReconnectAttempts) {
          connectionAttemptsRef.current += 1;

          reconnectTimeoutRef.current = setTimeout(() => {
            // ensure old socket is gone
            wsRef.current = null;
            connect();
          }, reconnectInterval);
        } else {
          setError('Max reconnection attempts reached');
        }
      };

      wsRef.current.onerror = (event) => {
        setError('WebSocket connection error');
        onErrorRef.current?.(event);
        // Optional: force-close so onclose handles reconnect path consistently
        try { wsRef.current?.close(); } catch {}
      };
    } catch (err) {
      setError(err.message);
    }
  }, [buildWebSocketUrl, protocols, maxReconnectAttempts, reconnectInterval, heartbeatInterval, sendHeartbeat]);
