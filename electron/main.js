// =============================================================================
// ECCLESIA Electron Main Process
// =============================================================================
// Wraps the web app in a native desktop window.  In dev mode loads the Vite
// dev server; in production loads the backend (which self-hosts the frontend
// from dist/ via express.static).  No custom HTTP server — the backend is
// the single source for both API and UI.
// =============================================================================

import { app, BrowserWindow, Tray, Menu, nativeImage, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isDev =
  process.env.ELECTRON_MODE === 'development' ||
  (!app.isPackaged && process.env.ELECTRON_MODE !== 'production');

if (isDev) {
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
  // Pin localhost to IPv4 so Vite's HMR websocket connects reliably.
  app.commandLine.appendSwitch('host-resolver-rules', 'MAP localhost 127.0.0.1');
}

const LOAD_URL = isDev
  ? 'http://localhost:3000'                         // Vite dev server
  : `http://localhost:${process.env.PORT || 5000}`;  // backend self-hosts dist/

let mainWindow = null;
let tray = null;
let isQuitting = false;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 1100, minHeight: 700,
    title: 'ECCLESIA Church Management System',
    icon: path.join(__dirname, 'assets', 'icon-256.png'),
    frame: true,
    backgroundColor: '#f8fafc',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  // Retry while Vite or the backend finishes starting.
  const load = (n = 0) => {
    mainWindow?.loadURL(LOAD_URL).catch(() => {
      if (n < 12) setTimeout(() => load(n + 1), 500);
    });
  };
  load();

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    if (isDev) mainWindow?.webContents.openDevTools({ mode: 'detach' });
  });

  // Close-to-tray instead of quitting.
  mainWindow.on('close', (e) => { if (!isQuitting) { e.preventDefault(); mainWindow?.hide(); } });
  mainWindow.on('closed', () => { mainWindow = null; });

  // External links open in the system browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try { if (new URL(url).protocol === 'https:') shell.openExternal(url); } catch {}
    return { action: 'deny' };
  });
}

function createTray() {
  const icon = nativeImage
    .createFromPath(path.join(__dirname, 'assets', 'icon-32.png'))
    .resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip('ECCLESIA Church Management System');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open ECCLESIA', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { type: 'separator' },
    { label: 'Quit', click: () => { isQuitting = true; app.quit(); } },
  ]));
  tray.on('double-click', () => { mainWindow?.show(); mainWindow?.focus(); });
}

app.whenReady().then(() => {
  createWindow();
  createTray();
  Menu.setApplicationMenu(null);
  app.on('activate', () => { if (!mainWindow) createWindow(); });
});

app.on('window-all-closed', () => { if (isQuitting) app.quit(); });
app.on('before-quit', () => { isQuitting = true; });
