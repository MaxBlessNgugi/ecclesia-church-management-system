// =============================================================================
// Socket.IO server — real-time event broadcasting for multi-user access
// =============================================================================
//
// PURPOSE
//   Provides a singleton Socket.IO server instance that authenticates connections
//   via JWT and broadcasts data-change events to all connected clients. Every
//   mutation route calls io.emit('data:change', { resource, action, data }) so
//   all open browsers update instantly when any user makes a change.
//
// AUTHENTICATION
//   The socket middleware reads the JWT from socket.handshake.auth.token,
//   verifies it, and attaches the decoded user payload to socket.data.user.
//   Unauthenticated connections are rejected with an Error('Authentication error').
//
// EVENT CONTRACT (server → client)
//   'data:change' → { resource: string, action: string, data: any, timestamp: string }
//
// RELATED FILES
//   - backend/src/index.ts         → Creates http.Server, attaches Socket.IO
//   - backend/src/lib/events.ts    → emitChange() helper used by route handlers
//   - src/context/SocketContext.tsx → Frontend Socket.IO client provider
//   - src/hooks/useRealtime.ts     → Frontend data-change listener hook
// =============================================================================
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { resolveJwtSecret } from './config.js';

// Cached Socket.IO server instance. Set once during server startup in index.ts.
let io: Server | null = null;

/**
 * Returns the Socket.IO server instance.
 * Must be called AFTER initSocket() has been invoked during server startup.
 */
export function getIO(): Server {
  if (!io) {
    throw new Error('Socket.IO server not initialized. Call initSocket() first.');
  }
  return io;
}

/**
 * Initializes the Socket.IO server on the given HTTP server.
 * Registers JWT authentication middleware and the default connection handler.
 *
 * @param httpServer - The Node.js HTTP server created by Express.
 * @returns The configured Socket.IO Server instance.
 */
export function initSocket(httpServer: import('http').Server): Server {
  io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || true,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // ── JWT Authentication Middleware ──────────────────────────────────────
  // Rejects connections without a valid token. Attaches decoded user to
  // socket.data.user so connection handlers can identify the user.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication error'));
    }

    try {
      const secret = resolveJwtSecret();
      const decoded = jwt.verify(token, secret) as { id: string; email: string; role: string };
      socket.data.user = decoded;
      next();
    } catch {
      next(new Error('Authentication error'));
    }
  });

  // ── Connection Handler ─────────────────────────────────────────────────
  io.on('connection', (socket) => {
    const user = socket.data.user;
    console.log(`[socket] User connected: ${user?.email ?? 'unknown'} (${socket.id})`);

    socket.on('disconnect', () => {
      console.log(`[socket] User disconnected: ${socket.id}`);
    });
  });

  return io;
}
