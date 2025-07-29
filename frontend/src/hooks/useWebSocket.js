import { useState, useEffect, useRef, useCallback } from 'react';

export const useWebSocket = (url, options = {}) => {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const [error, setError] = useState(null);
  const [connectionAttempts, setConnectionAttempts] = useState(0);
  
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
    protocols = []
  } = options;

  // Build WebSocket URL
  const buildWebSocketUrl = useCallback(() => {
    const baseUrl = process.env.REACT_APP_WS_URL || 'ws://localhost:5000';
    return `${baseUrl}${url}`;
  }, [url]);

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
      console.log('Connecting to WebSocket:', wsUrl);
      
      wsRef.current = new WebSocket(wsUrl, protocols);
      
      wsRef.current.onopen = (event) => {
        console.log('WebSocket connected');
        setIsConnected(true);
        setError(null);
        setConnectionAttempts(0);
        
        // Start heartbeat
        if (heartbeatInterval > 0) {
          heartbeatIntervalRef.current = setInterval(sendHeartbeat, heartbeatInterval);
        }
        
        if (onOpen) {
          onOpen(event);
        }
      };
      
      wsRef.current.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setLastMessage(data);
          
          // Handle pong responses
          if (data.type === 'pong') {
            console.log('Received pong from server');
            return;
          }
          
          if (onMessage) {
            onMessage(data, event);
          }
        } catch (err) {
          console.error('Error parsing WebSocket message:', err);
          setLastMessage(event.data);
          
          if (onMessage) {
            onMessage(event.data, event);
          }
        }
      };
      
      wsRef.current.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        setIsConnected(false);
        
        // Clear heartbeat
        if (heartbeatIntervalRef.current) {
          clearInterval(heartbeatIntervalRef.current);
          heartbeatIntervalRef.current = null;
        }
        
        if (onClose) {
          onClose(event);
        }
        
        // Attempt reconnection if not a clean close
        if (event.code !== 1000 && connectionAttempts < maxReconnectAttempts) {
          setConnectionAttempts(prev => prev + 1);
          console.log(`Attempting to reconnect... (${connectionAttempts + 1}/${maxReconnectAttempts})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectInterval);
        } else if (connectionAttempts >= maxReconnectAttempts) {
          setError('Max reconnection attempts reached');
        }
      };
      
      wsRef.current.onerror = (event) => {
        console.error('WebSocket error:', event);
        setError('WebSocket connection error');
        
        if (onError) {
          onError(event);
        }
      };
      
    } catch (err) {
      console.error('Error creating WebSocket connection:', err);
      setError(err.message);
    }
  }, [buildWebSocketUrl, protocols, onOpen, onMessage, onClose, onError, 
      connectionAttempts, maxReconnectAttempts, reconnectInterval, 
      heartbeatInterval, sendHeartbeat]);

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
    setConnectionAttempts(0);
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
    connectionAttempts,
    sendMessage,
    connect,
    disconnect,
    reconnect,
    getReadyState,
    getReadyStateString
  };
};