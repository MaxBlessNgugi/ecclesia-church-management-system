'use strict';
// =============================================================================
// Orphan watch — preload for the ECCLESIA Windows service.
// -----------------------------------------------------------------------------
// Injected ONLY by supervisor.cjs (it spawns the server as
// `node --require orphan-watch.cjs backend/dist/index.js`).
//
// Problem it solves: the SCM launches supervisor.cjs, which spawns the real
// server (backend/dist/index.js). If the supervisor process is killed without
// a graceful stop (SCM force-kill, supervisor crash, machine triage), the
// server child would keep running as an orphan — and hold port 80, which
// makes the next service start fail with EADDRINUSE.
//
// Fix: while running under the service, the server periodically checks that
// its parent (the supervisor) is still alive and exits if it is not. The
// check is unref'd so it can never keep the process alive on its own.
//
// The module exports `createOrphanWatcher` so the behaviour can be unit
// tested with a fake parent pid / exit hook; production behaviour is
// unchanged: at require time it auto-starts whenever the supervisor marker
// env var is present (which is exactly the --require preload case, where
// require.main is the server, not this module).
// =============================================================================

const fs = require('fs');
const path = require('path');

const DEFAULT_LOG_FILE = path.join(__dirname, '..', '..', 'backend', 'logs', 'service.log');
const DEFAULT_INTERVAL_MS = 5000;
const MARKER_ENV = 'ECCLESIA_SERVICE_SUPERVISOR_PID';

/** Append a line to the service log; never throws. */
function logToFile(logFile, line) {
  try {
    fs.mkdirSync(path.dirname(logFile), { recursive: true });
    fs.appendFileSync(logFile, `[${new Date().toISOString()}] [orphan-watch] ${line}\n`);
  } catch {
    /* logging must never take the server down */
  }
}

/**
 * Returns true when the pid is definitely gone. `process.kill(pid, 0)` is an
 * existence probe: ESRCH = no such process; EPERM = exists (but not ours to
 * signal) — treated as alive because we must not kill a healthy server on a
 * probe ambiguity.
 */
function parentAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    if (err && err.code === 'ESRCH') return false;
    return true;
  }
}

/**
 * Start watching `parentPid`. Returns the (unref'd) interval timer, or null
 * when the pid is unusable. When the parent disappears, logs once and calls
 * `exit` (defaults to process.exit(0) — killing this server so the next
 * service start can bind the port).
 */
function createOrphanWatcher(options = {}) {
  const parentPid = Number(options.parentPid);
  if (!Number.isFinite(parentPid) || parentPid <= 0) return null;

  const logFile = options.logFile || DEFAULT_LOG_FILE;
  const intervalMs = options.intervalMs || DEFAULT_INTERVAL_MS;
  const exit = options.exit || (() => process.exit(0));

  const timer = setInterval(() => {
    if (parentAlive(parentPid)) return;
    clearInterval(timer);
    logToFile(logFile, `supervisor pid ${parentPid} is gone — exiting server pid ${process.pid}`);
    exit();
  }, intervalMs);
  timer.unref();
  return timer;
}

/** Auto-start from the supervisor marker (the --require preload case). */
function startFromEnv(env = process.env) {
  const marker = env[MARKER_ENV];
  if (!marker) return null;
  return createOrphanWatcher({ parentPid: Number(marker) });
}

// Preload: run when the supervisor launched us (require.main here is the
// backend entry, never this module — auto-starting at require time is the
// point of the preload).
startFromEnv();

module.exports = { createOrphanWatcher, startFromEnv, parentAlive };
