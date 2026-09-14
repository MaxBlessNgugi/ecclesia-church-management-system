'use strict';
// =============================================================================
// ECCLESIA Windows service — installer (run from an ELEVATED prompt).
// -----------------------------------------------------------------------------
//   node scripts/windows-service/install.cjs
//
// Creates a Windows service named "EcclesiaServer" that survives reboots:
//   - SCM starts it automatically at boot (LocalSystem),
//   - the service host (winsw, managed by node-windows) restarts the daemon
//     if it dies (maxRetries with growing delay),
//   - stopparentfirst + stoptimeout give the supervisor a graceful stop
//     window when the service is stopped or the machine shuts down.
//
// Idempotent: if the service already exists, this prints a hint instead of
// reinstalling (run uninstall.cjs first to do a clean reinstall).
// =============================================================================

const path = require('node:path');
const nw = require('node-windows');

if (process.platform !== 'win32') {
  console.error('The Ecclesia Windows service can only be installed on Windows.');
  console.error('On Linux, use the systemd unit documented in INSTALL.md.');
  process.exit(1);
}

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const LOG_DIR = path.join(ROOT_DIR, 'backend', 'logs');

const svc = new nw.Service({
  name: 'EcclesiaServer',
  id: 'ecclesiaserver',
  description:
    'ECCLESIA ChMS — serves the app + API on http://ecclesia.local:80 (auto-restarting supervisor)',
  script: path.join(__dirname, 'supervisor.cjs'),
  workingdirectory: ROOT_DIR,
  logpath: LOG_DIR,
  logmode: 'rotate',
  maxRetries: 3, // winsw restarts the daemon up to 3 times with growing delay
  stopparentfirst: true, // graceful stop signal reaches the supervisor
  stoptimeout: 30, // seconds before the SCM force-kills the tree
});

if (svc.exists) {
  console.log('Service "EcclesiaServer" already exists — nothing to do.');
  console.log('To reinstall: node scripts/windows-service/uninstall.cjs (elevated), then install again.');
  process.exit(0);
}

svc.on('install', () => {
  console.log('Service installed — starting…');
  svc.start();
});

svc.on('alreadyinstalled', () => {
  console.log('Service already installed (detected during install) — start it with:');
  console.log('  net start EcclesiaServer');
});

svc.on('start', () => {
  console.log('Service "EcclesiaServer" started. The app is on http://ecclesia.local');
  process.exit(0);
});

svc.on('error', (err) => {
  console.error('Service error:', err);
  process.exit(1);
});

svc.install();
