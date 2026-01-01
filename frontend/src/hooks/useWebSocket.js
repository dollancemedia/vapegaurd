import { useState, useEffect, useRef, useCallback } from 'react';

export const useWebSocket = (url, options = {}) => {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const [error, setError] = useState(null);
  // Use ref for connection attempts to avoid re-renders and dependency loops
  const connectionAttemptsRef = useRef(0);
  
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const heartbeatIntervalRef = useRef(null);
  
  const {
    onMessage,
    onOpen,
    onClose,
    onError,
    reconnectInterval = 3000,
    maxReconnectAttempts = 5,
    heartbeatInterval = 30000,
    protocols: unsafeProtocols = [],
    queryParams: unsafeQueryParams = null
  } = options;

  // Memoize protocols and queryParams to prevent infinite reconnection loops
  // if the consumer passes unstable references (e.g. literals in render)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const protocols = useMemo(() => unsafeProtocols, [JSON.stringify(unsafeProtocols)]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const queryParams = useMemo(() => unsafeQueryParams, [JSON.stringify(unsafeQueryParams)]);

  // Refs for callbacks to avoid dependency loops
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

  // Build WebSocket URL
  const buildWebSocketUrl = useCallback(() => {
    let wsUrl = '';
    // Force using the environment variable in development
    const envBase = (process.env.REACT_APP_WS_URL || '').trim();
    if (envBase) {
      const normalized = envBase.endsWith('/') ? envBase.slice(0, -1) : envBase;
      // console.log('Using WebSocket URL:', `${normalized}${url}`);
      wsUrl = `${normalized}${url}`;
    } else {
      // Fallback to using the window location
      const wsScheme = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const fallbackUrl = `${wsScheme}://${window.location.host}${url}`;
      // console.log('Using fallback WebSocket URL:', fallbackUrl);
      wsUrl = fallbackUrl;
    }

    // Append query parameters if present
    if (queryParams) {
      const params = new URLSearchParams(queryParams);
      // Filter out null/undefined values
      const keys = Array.from(params.keys());
      for (const key of keys) {
        if (params.get(key) === 'null' || params.get(key) === 'undefined') {
          params.delete(key);
        }
      }
      
      const queryString = params.toString();
      if (queryString) {
        wsUrl += (wsUrl.includes('?') ? '&' : '?') + queryString;
      }
    }
    
    return wsUrl;
  }, [url, queryParams]);

  // Send message
  const sendMessage = useCallback((message) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      const messageStr = typeof message === 'string' ? message : JSON.stringify(message);
      wsRef.current.send(messageStr);
      return true;
    }
    console.warn('WebSocket is not connected. Message not sent:', message);
    return false;
  }, []);

  // Send heartbeat
  const sendHeartbeat = useCallback(() => {
    sendMessage({ type: 'ping', timestamp: Date.now() });
  }, [sendMessage]);

  // Connect to WebSocket
  const connect = useCallback(() => {
    try {
      const wsUrl = buildWebSocketUrl();
      // console.log('Connecting to WebSocket:', wsUrl);
      
      wsRef.current = new WebSocket(wsUrl, protocols);
      
      wsRef.current.onopen = (event) => {
        // console.log('WebSocket connected:', wsUrl);
        setIsConnected(true);
        setError(null);
        connectionAttemptsRef.current = 0;
        
        // Start heartbeat
        if (heartbeatInterval > 0) {
          heartbeatIntervalRef.current = setInterval(sendHeartbeat, heartbeatInterval);
        }
        
        if (onOpenRef.current) {
          onOpenRef.current(event);
        }
      };
      
      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setLastMessage(data);
          
          // Handle pong responses
          if (data.type === 'pong') {
            // console.log('Received pong from server');
            return;
          }
          
          if (onMessageRef.current) {
            onMessageRef.current(data, event);
          }
        } catch (err) {
          console.error('Error parsing WebSocket message:', err);
          setLastMessage(event.data);
          
          if (onMessageRef.current) {
            onMessageRef.current(event.data, event);
          }
        }
      };
      
      wsRef.current.onclose = (event) => {
        // console.log('WebSocket disconnected:', wsUrl, event.code, event.reason);
        setIsConnected(false);
        
        // Clear heartbeat
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
        }
        
        if (onCloseRef.current) {
          onCloseRef.current(event);
        }
        
        // Attempt reconnection if not a clean close
        if (event.code !== 1000 && connectionAttemptsRef.current < maxReconnectAttempts) {
          connectionAttemptsRef.current += 1;
          console.log(`Attempting to reconnect... (${connectionAttemptsRef.current}/${maxReconnectAttempts})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectInterval);
        } else if (connectionAttemptsRef.current >= maxReconnectAttempts) {
          setError('Max reconnection attempts reached');
        }
      };
      
      wsRef.current.onerror = (event) => {
        console.error('WebSocket error:', wsUrl, event);
        setError('WebSocket connection error');
        
        if (onErrorRef.current) {
          onErrorRef.current(event);
        }
      };
      
    } catch (err) {
      console.error('Error creating WebSocket connection:', err);
      setError(err.message);
    }
  }, [buildWebSocketUrl, protocols, maxReconnectAttempts, reconnectInterval, heartbeatInterval, sendHeartbeat]);

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    
    if (wsRef.current) {
      wsRef.current.close(1000, 'Component unmounting');
      wsRef.current = null;
    }
    
    setIsConnected(false);
    setError(null);
    connectionAttemptsRef.current = 0;
  }, []);

  // Reconnect manually
  const reconnect = useCallback(() => {
    disconnect();
    setTimeout(connect, 100);
  }, [disconnect, connect]);

  // Get connection state
  const getReadyState = useCallback(() => {
    if (!wsRef.current) return WebSocket.CLOSED;
    return wsRef.current.readyState;
  }, []);

  // Get connection state as string
  const getReadyStateString = useCallback(() => {
    const state = getReadyState();
    switch (state) {
      case WebSocket.CONNECTING: return 'CONNECTING';
      case WebSocket.OPEN: return 'OPEN';
      case WebSocket.CLOSING: return 'CLOSING';
      case WebSocket.CLOSED: return 'CLOSED';
      default: return 'UNKNOWN';
    }
  }, [getReadyState]);

  // Connect on mount
  useEffect(() => {
    connect();
    
    // Cleanup on unmount
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (heartbeatIntervalRef.current) {
        clearInterval(heartbeatIntervalRef.current);
      }
    };
  }, []);

  return {
    isConnected,
    lastMessage,
    error,
    connectionAttempts: connectionAttemptsRef.current,
    sendMessage,
    connect,
    disconnect,
    reconnect,
    getReadyState,
    getReadyStateString
  };
};