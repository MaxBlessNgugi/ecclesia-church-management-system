// =============================================================================
// Ecclesia Backend — Express Application Entrypoint
// =============================================================================
//
// PURPOSE
//   Bootstraps the HTTP server as a SINGLE process serving BOTH the API and
//   the built frontend (when available). No separate web server (nginx, Apache)
//   needed — parish PC runs `npm start` and gets the full app on one port.
//
//   Now enhanced with Socket.IO for real-time multi-user access:
//   - All connected browsers receive instant updates when any data changes
//   - JWT-authenticated WebSocket connections for secure real-time sync
//   - http.Server wraps Express so Socket.IO can share the same port
//
// STARTUP SEQUENCE
//   1. Load .env (dotenv/config) — must run before any other imports
//   2. resolveJwtSecret()      → Fail-fast if JWT_SECRET missing in production
//   3. Mount global middleware:
//      - helmet()               → Security headers (CSP, HSTS, X-Frame-Options)
//      - cors({origin: true})   → Permissive for LAN/dev (no credentials needed)
//      - morgan('dev')          → Request logging (method, url, status, ms)
//      - express.json(2mb)      → Body parser with size limit
//   4. Mount feature routers under /api/* (exact contract match with API.md)
//   5. Self-host frontend build from <repo>/dist when present
//      - express.static(FRONTEND_DIST)    → Serves assets with cache headers
//      - SPA fallback: /* → index.html    → Client-side routing for non-/api
//   6. Register centralized errorHandler as final middleware
//   7. Create http.Server from Express app
//   8. Initialize Socket.IO on the HTTP server (JWT-authenticated WebSocket)
//   9. httpServer.listen(PORT) — default 5000
//
// ROUTE MOUNT MAP (must match API.md exactly)
//   ┌──────────────────┬──────────────────────────────────────────────────────┐
//   │ Mount Path       │ Router Import                                        │
//   ├──────────────────┼──────────────────────────────────────────────────────┤
//   │ /api/auth        │ authRoutes        → POST /login, /me, /change-pw    │
//   │ /api/christians  │ christiansRoutes  → CRUD + /:id/sacraments PATCH    │
//   │ /api             │ activitiesRoutes  → /contributions, /transfers,     │
//   │                  │                   │   /billed-items                  │
//   │ /api/deaths      │ deathsRoutes      → List + Create                   │
//   │ /api             │ financeRoutes     → /deposits, /creditors*,         │
//   │                  │                   │   /debtors*, /expenses           │
//   │ /api/ledgers     │ ledgersRoutes     → List, Create, /transfer,        │
//   │                  │                   │   /movements                     │
//   │ /api/inventory   │ inventoryRoutes   │ → /items*, /deliveries, /sales, │
//   │                  │                   │   /stock-takes*, /issues         │
//   │ /api/hr          │ hrRoutes          → /employees*, /payrolls*,        │
//   │                  │                   │   /leaves*, /recruitments*       │
//   │ /api/admin       │ adminRoutes       → /users*, /permissions,          │
//   │                  │                   │   /push-payments, /audit-logs*   │
//   │ /api/reports     │ reportsRoutes     → /sacraments, /contributions,    │
//   │                  │                   │   /sales, /cashiers              │
//   │ /api/dashboard   │ dashboardRoutes   → /summary (counts + recent)      │
//   │ /api/settings    │ settingsRoutes    → GET singleton, PATCH partial     │
//   │ /api/sms         │ smsRoutes         → /settings, /send                 │
//   │ /api/support     │ supportRoutes     → /bundle (ZIP diagnostics)         │
//   └──────────────────┴──────────────────────────────────────────────────────┘
//
// FRONTEND SELF-HOSTING
//   - FRONTEND_DIST resolves to <repo>/dist relative to this file (works for
//     both tsx watch mode and compiled backend/dist)
//   - Only activates when dist/index.html exists (after `npm run build`)
//   - SPA fallback regex: /^(?!api(?:\/|$)).*/ — everything NOT starting with /api
//
// RELATED FILES
//   - backend/src/lib/config.ts        → resolveJwtSecret()
//   - backend/src/lib/socket.ts        → initSocket(), getIO()
//   - backend/src/lib/events.ts        → emitChange() for route handlers
//   - backend/src/middleware/errorHandler.ts → Centralized error handler
//   - backend/src/routes/*.ts          → Feature route modules
//   - vite.config.ts                   → Frontend build output → ../dist
//   - API.md                           → REST contract documentation
// =============================================================================

// Load environment variables from .env file into process.env.
// Must execute BEFORE any other imports that reference process.env.
import 'dotenv/config';

// Node.js built-in: filesystem module for checking if frontend dist exists.
import fs from 'node:fs';

// Node.js built-in: path utilities for resolving the frontend dist directory.
import path from 'node:path';

// Node.js built-in: converts import.meta.url to a file:// URL path,
// used to locate the frontend dist relative to this source file.
import { fileURLToPath } from 'node:url';

// Node.js built-in: http module for creating a shared server (Express + Socket.IO).
import http from 'node:http';

// Express framework: creates the HTTP server and provides routing/middleware.
import express from 'express';

// CORS middleware: enables Cross-Origin Resource Sharing for LAN and dev use.
// origin: true reflects the requesting origin; credentials: true allows cookies.
import cors from 'cors';

// Helmet middleware: sets security HTTP headers (CSP, HSTS, X-Frame-Options, etc.).
import helmet from 'helmet';

// Morgan middleware: HTTP request logger (method, URL, status, response time in ms).
import morgan from 'morgan';

// Resolves the JWT secret from environment variables.
// Fails fast in production if JWT_SECRET is not set.
import { resolveJwtSecret } from './lib/config.js';

// Centralized error-handling middleware that catches all unhandled errors.
import { errorHandler } from './middleware/errorHandler.js';

// Structured logger for production monitoring (replaces console.log).
import { logger } from './lib/logger.js';

// Socket.IO initializer — creates the real-time WebSocket server on the HTTP server.
import { initSocket } from './lib/socket.js';

// ── Startup: fail-fast checks ──────────────────────────────────────────────

// Validate that JWT_SECRET is present; throws in production if missing.
resolveJwtSecret();

// ── Feature route imports ──────────────────────────────────────────────────

// Authentication routes: POST /api/auth/login, /api/auth/me, /api/auth/change-pw.
import authRoutes from './routes/auth.js';

// Christian registry routes: CRUD + sacrament updates for church members.
import christiansRoutes from './routes/christians.js';

// Activity routes: contributions, transfers, and billed items (mounted at /api root).
import activitiesRoutes from './routes/activities.js';

// Death record routes: list and create death records for deceased members.
import deathsRoutes from './routes/deaths.js';

// Finance routes: deposits, creditors, debtors, and expense tracking (mounted at /api root).
import financeRoutes from './routes/finance.js';

// Ledger routes: financial ledger management, transfers between ledgers, and movement history.
import ledgersRoutes from './routes/ledgers.js';

// Inventory routes: items, deliveries, sales, stock-takes, and stock issues.
import inventoryRoutes from './routes/inventory.js';

// Human resources routes: employees, payrolls, leaves, and recruitment management.
import hrRoutes from './routes/hr.js';

// Admin routes: user management, permissions, push payments, and audit logs.
import adminRoutes from './routes/admin.js';

// Reports routes: sacraments, contributions, sales, and cashier reports.
import reportsRoutes from './routes/reports.js';

// Dashboard routes: summary counts and recent activity for the homepage.
import dashboardRoutes from './routes/dashboard.js';

// Settings routes: singleton parish configuration & first-run wizard state.
import settingsRoutes from './routes/settings.js';

// SMS routes: Africa's Talking configuration & message sending.
import smsRoutes from './routes/sms.js';

// Support bundle route: ZIP download of diagnostics + sanitized export.
import supportRoutes from './routes/support.js';

// ── Express app initialization ─────────────────────────────────────────────

// Create the Express application instance.
const app = express();

// Server port: read from PORT env var, default to 5000 if not set.
const PORT = Number(process.env.PORT) || 5000;

// ── Frontend self-hosting ──────────────────────────────────────────────────

// Resolve the path to the frontend build output directory (<repo>/dist).
// Works both in development (tsx watch) and production (compiled backend/dist).
const FRONTEND_DIST = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),  // directory of this file
  '../../dist',                                   // two levels up to repo root, then /dist
);

// Check if the frontend has been built (dist/index.html must exist).
const servingFrontend = fs.existsSync(path.join(FRONTEND_DIST, 'index.html'));

// ── Global middleware stack (order matters) ─────────────────────────────────

// Security headers: CSP, HSTS, X-Frame-Options, X-Content-Type-Options, etc.
// CSP includes connect-src for Socket.IO WebSocket connections, and imgSrc
// allows data: / blob: so base64-encoded parish logos can be rendered.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
      // Remove Helmet defaults that break a plain-HTTP server.
      upgradeInsecureRequests: null,
      scriptSrcAttr: ["'unsafe-inline'"],
    },
  },
}));

// CORS: allow any origin (for LAN parish networks). No credentials needed —
// auth is Bearer-token-in-header, not cookie-based.
// In production, restrict origins via CORS_ORIGINS env var (comma-separated).
// Requests without an Origin header (e.g. curl, health checks) are always allowed.
const corsOriginsRaw = (process.env.CORS_ORIGINS || '').trim();
const corsOrigins = corsOriginsRaw
  ? corsOriginsRaw.split(',').map((s) => s.trim()).filter(Boolean)
  : [];
const corsAllowAll =
  process.env.NODE_ENV !== 'production' || corsOrigins.length === 0;

app.use(cors({
  origin: corsAllowAll
    ? true
    : (origin: string | undefined) => {
        // Allow same-origin, curl, health checks (no Origin header).
        if (!origin) return true;
        // Allow any listed origin.
        if (corsOrigins.includes(origin)) return true;
        // Deny everything else.
        return false;
      },
  credentials: false,
}));

// Request logging: logs method, URL, status code, and response time in ms.
// Only in development — production uses the structured logger.
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// JSON body parser: allow larger payloads (5MB) for base64 logos (ParishSettings.logoData).
app.use(express.json({ limit: '5mb' }));

// ── Server configuration endpoint ───────────────────────────────────────

// GET /api/server/config — returns server metadata for client configuration.
// Allows clients to discover server name and version on first connection.
// In production, the version is omitted to prevent revealing the exact build number.
app.get('/api/server/config', (_req, res) => {
  const response: { name: string; port: number; version?: string } = {
    name: process.env.SERVER_NAME || 'Ecclesia Parish Server',
    port: PORT,
  };
  if (process.env.NODE_ENV !== 'production') {
    response.version = process.env.npm_package_version || '1.0.0';
  }
  res.json(response);
});

// ── Health check endpoint ──────────────────────────────────────────────────

// GET /api/health — lightweight endpoint for load balancers and monitoring.
// Verifies database connectivity on each call; returns 503 when the DB is down.
app.get('/api/health', async (_req, res) => {
  try {
    // Dynamically import Prisma client to avoid circular dependency issues.
    const { prisma } = await import('./lib/prisma.js');

    // Execute a trivial SQL query to verify the database connection is alive.
    await prisma.$queryRaw`SELECT 1`;

    // Return healthy status with server uptime and DB connectivity confirmed.
    res.json({
      status: 'ok',
      time: new Date().toISOString(),
      uptime: process.uptime(),
      db: 'connected',
    });
  } catch (err) {
    // Log the failure and return 503 Service Unavailable with error details.
    logger.error('Health check failed — database unreachable', { error: String(err) });
    res.status(503).json({
      status: 'error',
      time: new Date().toISOString(),
      uptime: process.uptime(),
      db: 'disconnected',
    });
  }
});

// ── Feature router mounting ────────────────────────────────────────────────

// Auth routes: /api/auth/login, /api/auth/me, /api/auth/change-pw
app.use('/api/auth', authRoutes);

// Christian registry: CRUD + sacrament updates for church member records.
app.use('/api/christians', christiansRoutes);

// Activities (mounted at /api root): /api/contributions, /api/transfers, /api/billed-items
app.use('/api', activitiesRoutes);

// Death records: /api/deaths (list and create death entries).
app.use('/api/deaths', deathsRoutes);

// Finance (mounted at /api root): /api/deposits, /api/creditors, /api/debtors, /api/expenses
app.use('/api', financeRoutes);

// Ledgers: /api/ledgers (financial ledger management and inter-ledger transfers).
app.use('/api/ledgers', ledgersRoutes);

// Inventory: /api/inventory (items, deliveries, sales, stock-takes, issues).
app.use('/api/inventory', inventoryRoutes);

// HR: /api/hr (employees, payrolls, leaves, recruitment).
app.use('/api/hr', hrRoutes);

// Admin: /api/admin (users, permissions, push payments, audit logs).
app.use('/api/admin', adminRoutes);

// Reports: /api/reports (sacraments, contributions, sales, cashier reports).
app.use('/api/reports', reportsRoutes);

// Dashboard: /api/dashboard (summary counts and recent activity for homepage).
app.use('/api/dashboard', dashboardRoutes);

// Parish settings: /api/parish (canonical) + /api/settings (backward-compat alias)
app.use('/api/parish', settingsRoutes);
app.use('/api/settings', settingsRoutes);

// SMS: /api/sms/settings + /api/sms/send (Africa's Talking integration).
app.use('/api/sms', smsRoutes);

// Support: /api/support/bundle (diagnostics + sanitized data ZIP download).
app.use('/api/support', supportRoutes);

// ── Frontend SPA serving ───────────────────────────────────────────────────

// Self-host the frontend build so a parish PC runs the whole app on one port.
// SPA fallback serves index.html for client-side routes (everything that is not
// an /api call). Skipped silently when the frontend has not been built yet.
if (servingFrontend) {
  // Serve static assets (JS, CSS, images) from the frontend dist directory.
  app.use(express.static(FRONTEND_DIST));

  // SPA fallback: any non-/api request returns index.html for client-side routing.
  // Regex /^(?!api(?:\/|$)).*/ matches everything that does NOT start with /api.
  app.get(/^\/(?!api(?:\/|$)).*/, (_req, res) => {
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
  });
}

// ── Centralized error handler (must be last middleware) ─────────────────────

// Catches all errors thrown/passed via next(e) from route handlers above.
app.use(errorHandler);

// ── Create HTTP server + Initialize Socket.IO ──────────────────────────────

// Wrap Express in a Node.js http.Server so Socket.IO can share the same port.
const httpServer = http.createServer(app);

// Initialize Socket.IO on the HTTP server — sets up JWT auth and connection handling.
// The io instance is accessible via getIO() from any route handler.
initSocket(httpServer);

// ── Start the HTTP server ──────────────────────────────────────────────────

// Bind to the configured port. Uses httpServer.listen (not app.listen) so
// both HTTP requests and WebSocket connections are served on the same port.
httpServer.listen(PORT, '0.0.0.0', () => {
  // Log server startup with structured logger for production monitoring.
  logger.info(`Ecclesia Server running on http://0.0.0.0:${PORT}`);
  logger.info(`Health: http://localhost:${PORT}/api/health`);
  logger.info(`WebSocket: ws://localhost:${PORT} (Socket.IO)`);
  logger.info(`Server is accessible from other devices on the LAN`);

  // If the frontend dist exists, log the full app URL.
  if (servingFrontend) {
    logger.info(`App: http://localhost:${PORT} (frontend served from ${FRONTEND_DIST})`);
  }
});
