'use strict';
// =============================================================================
// ECCLESIA Windows service — process supervisor.
// -----------------------------------------------------------------------------
// Runs as the script of a node-windows service (see install.cjs). The
// node-windows service host (winsw) owns the SCM protocol: it starts this
// process at boot, restarts it if it dies, and terminates the process tree
// on service stop. This module's only job is to babysit the real server:
//
//   - spawns backend/dist/index.js with PORT=80 / NODE_ENV=production forced
//     (service processes do not inherit a user shell environment),
//   - restarts the child if it crashes (crash-loop guard: after 3 fast
//     failures it stops so winsw's own restart policy can take over),
//   - appends everything to backend/logs/service.log (gitignored).
//
// Orphan protection: the child is spawned as `node --require orphan-watch.cjs
// <server>` (argv, not NODE_OPTIONS, so paths with spaces are safe). The
// preload exits the server if this supervisor dies, so a force-killed
// supervisor can never leave an orphan holding port 80.
//
// Configuration (all optional):
//   ECCLESIA_SERVICE_SERVER_ENTRY  - server entry to run (default backend/dist/index.js)
//   ECCLESIA_SERVICE_LOG_FILE      - where supervisor + server output goes
//
// Testing: `node scripts/windows-service/supervisor.cjs` also runs
// interactively in a terminal (Ctrl+C = graceful stop) — do that before
// installing the service.
// =============================================================================

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const RESTART_DELAY_MS = 3000;
const GRACEFUL_STOP_TIMEOUT_MS = 5000;
const MAX_FAST_FAILS = 3; // crash-loop guard before letting winsw restart us
const FAST_FAIL_WINDOW_MS = 60_000;

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const BACKEND_DIR = path.join(ROOT_DIR, 'backend');
const SERVER_ENTRY =
  process.env.ECCLESIA_SERVICE_SERVER_ENTRY || path.join(BACKEND_DIR, 'dist', 'index.js');
const ORPHAN_WATCH = path.join(__dirname, 'orphan-watch.cjs');
const LOG_FILE =
  process.env.ECCLESIA_SERVICE_LOG_FILE || path.join(BACKEND_DIR, 'logs', 'service.log');

function log(line) {
  try {
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] [supervisor] ${line}\n`);
  } catch {
    /* logging must never take the service down */
  }
}

log(`supervisor starting (pid ${process.pid}) — entry: ${SERVER_ENTRY}`);

// ── Guard: fail fast with a clear log line if prerequisites are missing ─────
if (!fs.existsSync(SERVER_ENTRY)) {
  log(`FATAL: ${SERVER_ENTRY} not found. Run "npm run build" (root and backend/) first.`);
  process.exit(1);
}

let child = null;
let stopping = false;
let fastFails = 0;
let lastStartAt = 0;

function spawnServer() {
  lastStartAt = Date.now();
  log('spawning server (NODE_ENV=production, PORT=80)');

  child = spawn(process.execPath, ['--require', ORPHAN_WATCH, SERVER_ENTRY], {
    cwd: BACKEND_DIR, // dotenv/config loads backend/.env relative to cwd
    env: {
      ...process.env,
      NODE_ENV: 'production',
      PORT: '80',
      // orphan-watch.cjs (--require preload above) exits the server if the
      // supervisor dies; it needs to know which pid to watch.
      ECCLESIA_SERVICE_SUPERVISOR_PID: String(process.pid),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  log(`server spawned (pid ${child.pid})`);

  // Forward server stdout/stderr into the service log (pino startup lines,
  // structured errors, stack traces).
  for (const stream of ['stdout', 'stderr']) {
    child[stream].on('data', (chunk) => {
      for (const line of String(chunk).split(/\r?\n/)) {
        if (line.trim()) log(`[server] ${line}`);
      }
    });
  }

  child.on('exit', (code, signal) => {
    const wasFastFail = Date.now() - lastStartAt < FAST_FAIL_WINDOW_MS;
    child = null;

    if (stopping) {
      log(`server exited during stop (code=${code}, signal=${signal}) — supervisor exiting`);
      process.exit(0);
      return;
    }

    fastFails = wasFastFail ? fastFails + 1 : 0;

    if (fastFails >= MAX_FAST_FAILS) {
      log(
        `FATAL: ${fastFails} crashes within ${FAST_FAIL_WINDOW_MS / 1000}s — supervisor exiting so the ` +
          `service host's restart policy can take over. See backend/logs/service.log.`,
      );
      process.exit(1);
    }

    log(`server exited unexpectedly (code=${code}, signal=${signal}) — restarting in ${RESTART_DELAY_MS}ms`);
    setTimeout(() => {
      if (!stopping) spawnServer();
    }, RESTART_DELAY_MS);
  });
}

// ── Graceful stop on termination signals (service stop / Ctrl+C) ────────────
function gracefulStop() {
  if (stopping) return;
  stopping = true;
  log('stop requested — terminating server gracefully');
  if (child) {
    child.kill(); // SIGTERM → TerminateProcess on Windows
    const forceKill = setTimeout(() => {
      if (child) {
        log(`graceful stop timed out after ${GRACEFUL_STOP_TIMEOUT_MS}ms — force killing`);
        child.kill('SIGKILL');
      }
    }, GRACEFUL_STOP_TIMEOUT_MS);
    forceKill.unref();
  } else {
    process.exit(0);
  }
}

process.on('SIGINT', gracefulStop);
process.on('SIGTERM', gracefulStop);
process.on('SIGHUP', gracefulStop);
// windowsHide consoles get a console-control break when the service host
// kills the tree; treat it like any other stop.
process.on('SIGBREAK', gracefulStop);

spawnServer();
