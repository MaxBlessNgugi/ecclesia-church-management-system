// =============================================================================
// ECCLESIA Electron Main Process
// =============================================================================
// Launches a local HTTP server that serves the built frontend (dist/) and
// creates a native BrowserWindow pointing at it.  In dev mode the Vite dev
// server is used instead.  Manages system tray and close-to-tray behaviour.
// =============================================================================

import { app, BrowserWindow, Tray, Menu, nativeImage, dialog, shell } from 'electron';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isDev =
  process.env.ELECTRON_MODE === 'development' ||
  (!app.isPackaged && process.env.ELECTRON_MODE !== 'production');

if (isDev) {
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
  app.commandLine.appendSwitch('host-resolver-rules', 'MAP localhost 127.0.0.1');
}

const DIST_DIR = isDev
  ? path.resolve(__dirname, '..', 'dist')      // not used in dev (Vite serves)
  : path.join(process.resourcesPath, 'dist');
const FRONTEND_PORT = 18234;
const LOAD_URL = isDev ? 'http://localhost:3000' : `http://127.0.0.1:${FRONTEND_PORT}`;

let mainWindow = null;
let tray = null;
let isQuitting = false;
let frontendServer = null;

// --- MIME types for the production static-file server ---
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js':   'application/javascript; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
};

// --- Production-only local HTTP server for dist/ ---
function startFrontendServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      let filePath = path.join(DIST_DIR, urlPath === '/' ? 'index.html' : urlPath);
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(DIST_DIR, 'index.html'); // SPA fallback
      }
      try {
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, {
          'Content-Type': MIME[ext] || 'application/octet-stream',
          'Cache-Control': 'no-cache',
        });
        res.end(fs.readFileSync(filePath));
      } catch {
        res.writeHead(500);
        res.end('Internal Server Error');
      }
    });
    server.listen(FRONTEND_PORT, '127.0.0.1', () => { frontendServer = server; resolve(); });
    server.on('error', reject);
  });
}

// --- Window ---
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400, height: 900, minWidth: 1100, minHeight: 700,
    title: 'ECCLESIA Church Management System',
    icon: path.join(__dirname, 'assets', 'icon-256.png'),
    frame: true,
    backgroundColor: '#f8fafc',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    show: false,
  });

  // Retry while the local server or Vite finishes starting
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

  mainWindow.on('close', (e) => { if (!isQuitting) { e.preventDefault(); mainWindow?.hide(); } });
  mainWindow.on('closed', () => { mainWindow = null; });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try { if (new URL(url).protocol === 'https:') shell.openExternal(url); } catch {}
    return { action: 'deny' };
  });
}

// --- System Tray ---
function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon-32.png'))
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

// --- Lifecycle ---
app.whenReady().then(async () => {
  try {
    if (!isDev) await startFrontendServer();
    createWindow();
    createTray();
    Menu.setApplicationMenu(null);
    app.on('activate', () => { if (!mainWindow) createWindow(); });
  } catch (err) {
    dialog.showErrorBox('ECCLESIA Startup Error', String(err));
    app.quit();
  }
});

app.on('window-all-closed', () => { if (isQuitting) app.quit(); });
app.on('before-quit', () => { isQuitting = true; frontendServer?.close(); });
