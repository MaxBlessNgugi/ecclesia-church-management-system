// =============================================================================
// Socket.IO React Context — real-time data synchronization
// =============================================================================
//
// PURPOSE
//   Provides a Socket.IO client connection to the entire React component tree.
//   When any user makes a change, the backend broadcasts a 'data:change' event
//   to all connected clients. This context manages the connection lifecycle
//   and provides the socket instance to child components via useSocket().
//
// USAGE
//   // Wrap the app:
//   <SocketProvider>
//     <App />
//   </SocketProvider>
//
//   // In any component:
//   const { socket, connected } = useSocket();
//
// RELATED FILES
//   - backend/src/lib/socket.ts  → Server-side Socket.IO with JWT auth
//   - backend/src/lib/events.ts  → emitChange() broadcasts data:change events
//   - src/hooks/useRealtime.ts   → Hook for subscribing to resource-specific changes
// =============================================================================
import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { getStoredToken, getServerUrl } from '../services/api';

interface SocketContextType {
  /** The Socket.IO client instance, or null if not yet connected. */
  socket: Socket | null;
  /** Whether the Socket.IO connection is currently active. */
  connected: boolean;
}

const SocketContext = createContext<SocketContextType>({
  socket: null,
  connected: false,
});

/**
 * Socket.IO provider that establishes and manages the WebSocket connection.
 *
 * - Connects automatically when a JWT token is available
 * - Reconnects on disconnect (with exponential backoff via Socket.IO defaults)
 * - Disconnects when the token is removed (logout)
 * - Cleans up on unmount
 */
import { resolveSocketUrl } from '../utils/url';

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) return;

    // Resolve the Socket.IO root server URL (strips /api and trailing slashes)
    const serverUrl = resolveSocketUrl(
      getServerUrl(),
      import.meta.env.VITE_API_BASE_URL as string | undefined,
      window.location.origin
    );

    const newSocket = io(serverUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });

    newSocket.on('connect', () => {
      console.log('[socket] Connected to server');
      setConnected(true);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('[socket] Disconnected:', reason);
      setConnected(false);
    });

    newSocket.on('connect_error', (err) => {
      console.warn('[socket] Connection error:', err.message);
    });

    socketRef.current = newSocket;
    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
      socketRef.current = null;
      setSocket(null);
      setConnected(false);
    };
  }, []);

  return (
    <SocketContext.Provider value={{ socket, connected }}>
      {children}
    </SocketContext.Provider>
  );
};

/**
 * Hook to access the Socket.IO connection from any component.
 *
 * @returns The socket instance and connection status.
 */
export function useSocket(): SocketContextType {
  return useContext(SocketContext);
}
