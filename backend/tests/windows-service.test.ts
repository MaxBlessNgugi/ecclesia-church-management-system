/**
 * Windows-service scripts + static-preview server — test suite
 *
 * Covers (audit P1.1 watchdog):
 *   1. orphan-watch.cjs    — unit tests: exits when its supervisor pid dies,
 *                            stays alive while the parent exists, guards bad pids.
 *   2. supervisor.cjs      — real child-process integration: fails fast when the
 *                            server entry is missing, forces NODE_ENV=production /
 *                            PORT=80, crash-loop guard exits after 3 fast failures,
 *                            graceful SIGTERM stop (POSIX), and orphan protection
 *                            when the supervisor is SIGKILLed (POSIX).
 *   3. server.cjs          — static preview: serves dist/, SPA fallback, and the
 *                            truthful /api 404 (skipped when dist/ is not built,
 *                            e.g. the CI backend-test stage before the build job).
 *
 * Supervisor tests spawn real `node` child processes against throwaway fixture
 * "servers" written to a temp dir; the supervisor's entry + log paths are
 * redirected there via its ECCLESIA_SERVICE_* env overrides, so the real
 * backend/dist or backend/logs are never touched.
 */
import { describe, it, expect, vi, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import net from 'node:net';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

// Repo root, derived from this file's real location (import.meta.url → path)
// instead of __dirname: vitest/tsx shim __dirname for ESM today, but plain ESM
// does not define it — the module-URL form works under any runner, so the
// suite finds scripts/ and dist/ on any machine and from any cwd.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ORPHAN_MODULE = path.join(ROOT, 'scripts', 'windows-service', 'orphan-watch.cjs');
const SUPERVISOR = path.join(ROOT, 'scripts', 'windows-service', 'supervisor.cjs');
const STATIC_SERVER = path.join(ROOT, 'server.cjs');
const IS_WIN = process.platform === 'win32';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'ecclesia-svc-test-'));
const requireCjs = createRequire(import.meta.url);

// ─── Fixture "servers" (written to TMP, referenced via env overrides) ───────

const CRASHY_SERVER = path.join(TMP, 'crashy-server.cjs');
const IDLE_SERVER = path.join(TMP, 'idle-server.cjs');
const PID_FILE = path.join(TMP, 'idle-server.pid');

fs.writeFileSync(
  CRASHY_SERVER,
  [
    `// Crashes immediately after reporting the environment the supervisor forced.`,
    `console.log('ENV|' + process.env.NODE_ENV + '|' + process.env.PORT + '|' + (process.env.ECCLESIA_SERVICE_SUPERVISOR_PID || ''));`,
    `process.exit(1);`,
    '',
  ].join('\n'),
  'utf8',
);
fs.writeFileSync(
  IDLE_SERVER,
  [
    `// Long-running stand-in for the real backend. Writes its pid so tests can`,
    `// assert the orphan actually exits.`,
    `require('fs').writeFileSync(${JSON.stringify(PID_FILE)}, String(process.pid));`,
    `console.log('READY|' + (process.env.ECCLESIA_SERVICE_SUPERVISOR_PID || ''));`,
    `setInterval(() => {}, 1000);`,
    '',
  ].join('\n'),
  'utf8',
);

// ─── Small helpers ───────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(label: string, predicate: () => boolean | Promise<boolean>, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await sleep(50);
  }
  throw new Error(`Timed out waiting for: ${label}`);
}

function readLog(logFile: string): string {
  try {
    return fs.readFileSync(logFile, 'utf8');
  } catch {
    return '';
  }
}

async function waitLog(logFile: string, re: RegExp, timeoutMs = 10_000): Promise<void> {
  await waitFor(`log ${path.basename(logFile)} to match ${re}`, () => re.test(readLog(logFile)), timeoutMs);
}

function exitCode(child: ChildProcess): Promise<number | null> {
  return new Promise((resolve) => child.once('exit', (code) => resolve(code)));
}

function spawnSupervisor(extraEnv: Record<string, string>) {
  const logFile = path.join(TMP, `supervisor-${Date.now()}-${Math.random().toString(36).slice(2)}.log`);
  const child = spawn(process.execPath, [SUPERVISOR], {
    env: { ...process.env, ECCLESIA_SERVICE_LOG_FILE: logFile, ...extraEnv },
    stdio: ['ignore', 'ignore', 'ignore'],
  });
  return { child, logFile };
}

/** A pid that no longer exists (spawn a process that exits immediately). */
function deadPid(): number {
  const res = spawnSync(process.execPath, ['-e', '']);
  const pid = res.pid;
  if (!pid || pid <= 0) throw new Error('could not obtain a dead pid');
  return pid;
}

const spawnedChildren: ChildProcess[] = [];
function track(child: ChildProcess): ChildProcess {
  spawnedChildren.push(child);
  return child;
}

afterAll(() => {
  for (const child of spawnedChildren) {
    if (child.exitCode === null && !child.killed) {
      try {
        child.kill('SIGKILL');
      } catch {
        /* already gone */
      }
    }
  }
  fs.rmSync(TMP, { recursive: true, force: true });
});

// ═══════════════════════════════════════════════════════════════════════════
// 1 — orphan-watch (unit)
// ═══════════════════════════════════════════════════════════════════════════

describe('orphan-watch.cjs', () => {
  function loadModule() {
    // The preload auto-starts only when the marker env var is present — keep
    // the test environment marker-free so requiring the module is inert.
    delete process.env.ECCLESIA_SERVICE_SUPERVISOR_PID;
    return requireCjs(ORPHAN_MODULE) as {
      createOrphanWatcher: (opts: Record<string, unknown>) => NodeJS.Timeout | null;
      parentAlive: (pid: number) => boolean;
    };
  }

  it('exits when the supervisor pid is gone', async () => {
    const orphan = loadModule();
    const logFile = path.join(TMP, 'orphan-dead.log');
    const exit = vi.fn();

    const timer = orphan.createOrphanWatcher({ parentPid: deadPid(), logFile, intervalMs: 5, exit });
    expect(timer).not.toBeNull();

    await waitFor('orphan watcher to exit', () => exit.mock.calls.length === 1, 3000);
    expect(exit).toHaveBeenCalledTimes(1);
    expect(readLog(logFile)).toContain('[orphan-watch] supervisor pid');
  });

  it('stays alive while the supervisor exists', async () => {
    const orphan = loadModule();
    const exit = vi.fn();

    const timer = orphan.createOrphanWatcher({ parentPid: process.pid, intervalMs: 10, exit });
    expect(timer).not.toBeNull();
    await sleep(80);
    expect(exit).not.toHaveBeenCalled();
    if (timer) clearInterval(timer);
  });

  it('rejects unusable parent pids', () => {
    const orphan = loadModule();
    expect(orphan.createOrphanWatcher({ parentPid: 0, intervalMs: 5, exit: vi.fn() })).toBeNull();
    expect(orphan.createOrphanWatcher({ parentPid: Number.NaN, intervalMs: 5, exit: vi.fn() })).toBeNull();
    expect(orphan.createOrphanWatcher({ parentPid: -1, intervalMs: 5, exit: vi.fn() })).toBeNull();
  });

  it('parentAlive reflects process existence', () => {
    const orphan = loadModule();
    expect(orphan.parentAlive(process.pid)).toBe(true);
    expect(orphan.parentAlive(deadPid())).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2 — supervisor.cjs (child-process integration)
// ═══════════════════════════════════════════════════════════════════════════

describe('supervisor.cjs', () => {
  it('exits with a FATAL log line when the server entry is missing', async () => {
    const { child, logFile } = spawnSupervisor({
      ECCLESIA_SERVICE_SERVER_ENTRY: path.join(TMP, 'does-not-exist.js'),
    });
    track(child);
    const code = await Promise.race([exitCode(child), sleep(8000).then(() => 'timeout')]);
    expect(code).toBe(1);
    expect(readLog(logFile)).toContain('FATAL');
    expect(readLog(logFile)).toContain('not found');
  });

  it('forces production + port 80 on the child and crash-loop-guards after 3 fast failures', async () => {
    const { child, logFile } = spawnSupervisor({ ECCLESIA_SERVICE_SERVER_ENTRY: CRASHY_SERVER });
    track(child);

    const code = await Promise.race([exitCode(child), sleep(35_000).then(() => 'timeout')]);
    expect(code, readLog(logFile)).toBe(1);
    const log = readLog(logFile);

    // The child must have reported the supervisor-forced environment.
    expect(log).toMatch(/\[server\] ENV\|production\|80\|\d+/);
    // Crash-loop guard: the supervisor gives up after 3 fast failures.
    const spawnCount = (log.match(/spawning server/g) || []).length;
    expect(spawnCount).toBeGreaterThanOrEqual(3);
    expect(log).toContain('FATAL');
    expect(log).toContain('crash');
  }, 45_000);
});

// ── Graceful stop + orphan protection need real signals (POSIX only) ────────

describe.skipIf(IS_WIN)('supervisor.cjs — signal handling (POSIX)', () => {
  it('stops the server gracefully and exits 0 on SIGTERM', async () => {
    const { child, logFile } = spawnSupervisor({ ECCLESIA_SERVICE_SERVER_ENTRY: IDLE_SERVER });
    track(child);
    await waitLog(logFile, /\[server\] READY\|/, 10_000);

    child.kill('SIGTERM');
    const code = await Promise.race([exitCode(child), sleep(15_000).then(() => 'timeout')]);
    expect(code, readLog(logFile)).toBe(0);
    const log = readLog(logFile);
    expect(log).toContain('stop requested');
    expect(log).toContain('supervisor exiting');
  }, 20_000);

  it('orphan-watch exits the server when the supervisor is SIGKILLed', async () => {
    const { child, logFile } = spawnSupervisor({ ECCLESIA_SERVICE_SERVER_ENTRY: IDLE_SERVER });
    track(child);
    await waitLog(logFile, /\[server\] READY\|/, 10_000);

    // Learn the server's pid from its pid file, then kill the supervisor hard.
    const serverPid = Number(fs.readFileSync(PID_FILE, 'utf8'));
    expect(serverPid).toBeGreaterThan(0);
    child.kill('SIGKILL');
    await Promise.race([exitCode(child), sleep(5000)]);

    // The orphan watcher (5s poll) must notice and kill the server.
    await waitFor('orphan server process to exit', () => {
      try {
        process.kill(serverPid, 0);
        return false;
      } catch (err) {
        return (err as NodeJS.ErrnoException).code === 'ESRCH';
      }
    }, 12_000);
    expect(readLog(logFile)).toContain('[orphan-watch] supervisor pid');
  }, 25_000);
});

// ═══════════════════════════════════════════════════════════════════════════
// 3 — server.cjs static preview (skipped when dist/ is not built yet)
// ═══════════════════════════════════════════════════════════════════════════

const DIST_INDEX = path.join(ROOT, 'dist', 'index.html');

function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

describe.skipIf(!fs.existsSync(DIST_INDEX))('server.cjs (static preview)', () => {
  it('serves dist/, applies the SPA fallback, and 404s /api with JSON', async () => {
    const port = await getFreePort();
    const child = track(spawn(process.execPath, [STATIC_SERVER], {
      env: { ...process.env, PORT: String(port) },
      stdio: ['ignore', 'pipe', 'pipe'],
    }));
    let stdout = '';
    child.stdout?.on('data', (d) => (stdout += String(d)));
    await waitFor('static server to boot', () => stdout.includes(`Server on http://`), 5000);

    const base = `http://127.0.0.1:${port}`;
    const home = await fetch(`${base}/`);
    expect(home.status).toBe(200);
    expect(home.headers.get('content-type')).toContain('text/html');
    const homeBody = await home.text();
    expect(homeBody.length).toBeGreaterThan(0);

    // Unknown deep link → SPA fallback serves index.html.
    const fallback = await fetch(`${base}/christian/parishioners`);
    expect(fallback.status).toBe(200);
    expect(await fallback.text()).toBe(homeBody);

    // API paths have no backend in the static preview → truthful JSON 404.
    const api = await fetch(`${base}/api/health`);
    expect(api.status).toBe(404);
    expect(api.headers.get('content-type')).toContain('application/json');
    const apiBody = await api.json();
    expect(apiBody).toHaveProperty('error');

    // Path traversal must never escape dist/ — raw ../ (curl/nc send it
    // verbatim, so fetch() cannot express it) and %2e%2e%2f encodings alike.
    const rawProbe = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const probe = http.request(
        { host: '127.0.0.1', port, path: '/../backend/.env', method: 'GET' },
        (res) => {
          let body = '';
          res.on('data', (d) => (body += String(d)));
          res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
        },
      );
      probe.on('error', reject);
      probe.end();
    });
    expect(rawProbe.status).toBe(404);
    expect(rawProbe.body).not.toMatch(/JWT_SECRET|DATABASE_URL/);

    const encodedProbe = await fetch(`${base}/%2e%2e%2fpackage.json`);
    expect(encodedProbe.status).toBe(404);
  }, 15_000);
});
