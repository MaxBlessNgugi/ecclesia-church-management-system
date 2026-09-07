'use strict';
// =============================================================================
// ECCLESIA Windows service — uninstaller (run from an ELEVATED prompt).
// -----------------------------------------------------------------------------
//   node scripts/windows-service/uninstall.cjs
//
// Stops the service if running, then removes it entirely.
// =============================================================================

if (process.platform !== 'win32') {
  console.error('The Ecclesia Windows service can only be uninstalled on Windows.');
  process.exit(1);
}

const nw = require('node-windows');

const svc = new nw.Service({ name: 'EcclesiaServer', id: 'ecclesiaserver' });

if (!svc.exists) {
  console.log('Service "EcclesiaServer" is not installed — nothing to do.');
  process.exit(0);
}

svc.on('uninstall', () => {
  console.log(`Service "EcclesiaServer" removed. Exists: ${svc.exists}`);
  process.exit(0);
});

svc.on('error', (err) => {
  console.error('Service error:', err);
  process.exit(1);
});

svc.uninstall();
