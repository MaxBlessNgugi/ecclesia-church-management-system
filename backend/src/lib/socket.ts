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
import { appPrisma } from './prisma.js';
import { verifyToken } from './auth.js';

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
/**
 * Resolves the Socket.IO CORS origin policy from environment configuration.
 *
 * Allowed origins come from BOTH CLIENT_URL and CORS_ORIGINS (comma-separated).
 * When neither is set, every origin is allowed — the LAN model, mirroring the
 * REST CORS default in index.ts: the browser always connects back to the same
 * origin it was served from (window.location.origin), which may be a hostname,
 * an IP, or localhost. Operators who need a locked-down deployment set
 * CLIENT_URL / CORS_ORIGINS to restrict both REST and realtime connections.
 */
export function resolveSocketOrigins(): true | string[] {
  const configured = [
    ...(process.env.CLIENT_URL || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    ...(process.env.CORS_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  ];
  return configured.length > 0 ? configured : true;
}

export function initSocket(httpServer: import('http').Server): Server {
  io = new Server(httpServer, {
    cors: {
      origin: resolveSocketOrigins(),
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // ── JWT Authentication Middleware ──────────────────────────────────────
  // Rejects connections without a valid token. Mirrors the REST requireAuth
  // contract: signature + expiry via verifyToken, then a live DB check for
  // active status AND the tokenVersion claim, so tokens issued before a
  // password change/reset cannot open new realtime sessions either.
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error('Authentication error'));
    }

    try {
      const decoded = verifyToken(token);
      const user = await appPrisma.user.findUnique({
        where: { id: decoded.id },
        select: { id: true, email: true, role: true, isActive: true, tokenVersion: true },
      });
      if (!user || !user.isActive || (user.tokenVersion ?? 0) !== (decoded.tokenVersion ?? -1)) {
        return next(new Error('Authentication error'));
      }
      socket.data.user = { id: user.id, email: user.email, role: user.role };
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
