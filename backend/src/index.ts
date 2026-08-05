// =============================================================================
// Ecclesia Backend — Express application entrypoint
// -----------------------------------------------------------------------------
// Bootstraps the HTTP server:
//   1. Global hardening middleware: Helmet (security headers), permissive CORS
//      (origin: true for the LAN/dev setup), Morgan request logging, JSON body
//      parser with a 2mb cap.
//   2. Resolves a real JWT signing secret (fail-fast in production).
//   3. Starts the periodic SQLite backup scheduler.
//   4. Mounts all feature routers under /api/* to match the API.md contract.
//   5. Self-hosts the built frontend (<repo>/dist) when present, so the whole
//      app runs as ONE process on ONE port — no separate web server needed.
//   6. Registers the centralized error handler as the final middleware.
// Start: `npm run dev` (tsx watch) or `npm run build && npm start`.
// =============================================================================
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { resolveJwtSecret } from './lib/config.js';
import { startBackupScheduler } from './lib/backup.js';
import { errorHandler } from './middleware/error.js';

resolveJwtSecret();
startBackupScheduler();

import authRoutes from './routes/auth.js';
import christiansRoutes from './routes/christians.js';
import activitiesRoutes from './routes/activities.js';
import deathsRoutes from './routes/deaths.js';
import financeRoutes from './routes/finance.js';
import ledgersRoutes from './routes/ledgers.js';
import inventoryRoutes from './routes/inventory.js';
import hrRoutes from './routes/hr.js';
import adminRoutes from './routes/admin.js';
import reportsRoutes from './routes/reports.js';
import dashboardRoutes from './routes/dashboard.js';

const app = express();
const PORT = Number(process.env.PORT) || 5000;

// The built frontend lives at <repo root>/dist. Resolved from this module so it
// works both via tsx (backend/src) and the compiled build (backend/dist).
const FRONTEND_DIST = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../dist',
);
const servingFrontend = fs.existsSync(path.join(FRONTEND_DIST, 'index.html'));

app.use(helmet());
app.use(cors({ origin: true, credentials: true }));
app.use(morgan('dev'));
app.use(express.json({ limit: '2mb' }));

// Health
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Mount routes to match API.md contract exactly
app.use('/api/auth', authRoutes);
app.use('/api/christians', christiansRoutes);
app.use('/api', activitiesRoutes); // /api/contributions, /api/transfers, /api/billed-items
app.use('/api/deaths', deathsRoutes);
app.use('/api', financeRoutes); // /api/deposits, /api/creditors, ...
app.use('/api/ledgers', ledgersRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/hr', hrRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Self-host the frontend build so a parish PC runs the whole app on one port.
// SPA fallback serves index.html for client-side routes (everything that is not
// an /api call). Skipped silently when the frontend has not been built yet.
if (servingFrontend) {
  app.use(express.static(FRONTEND_DIST));
  app.get(/^\/(?!api(?:\/|$)).*/, (_req, res) => {
    res.sendFile(path.join(FRONTEND_DIST, 'index.html'));
  });
}

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`\n  Ecclesia Server running on http://localhost:${PORT}`);
  console.log(`  Health: http://localhost:${PORT}/api/health`);
  if (servingFrontend) {
    console.log(`  App:    http://localhost:${PORT}  (frontend served from ${FRONTEND_DIST})`);
  }
  console.log('');
});
