// =============================================================================
// ECCLESIA Electron Main Process
// =============================================================================
// Starts the Express backend, creates the BrowserWindow, manages system tray,
// and handles "close to tray" behavior for a native desktop experience.
// =============================================================================

import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, dialog, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Dev vs production:
//  - Packaged app  -> production
//  - ELECTRON_MODE=production  -> force production (useful when running unpackaged)
//  - ELECTRON_MODE=development -> force development
//  - Otherwise (plain `electron .`) -> development
const isDev =
  process.env.ELECTRON_MODE === 'development' ||
  (!app.isPackaged && process.env.ELECTRON_MODE !== 'production');

// The app ships a strict Content-Security-Policy (vite dev header + index.html
// <meta> + helmet() in production), so the renderer is genuinely locked down.
// Electron still prints its dev-mode "Insecure Content-Security-Policy" warning
// on some setups even with a valid CSP (known issue: electron/electron#31029),
// so suppress that dev-only noise here. Packaged builds never show it.
if (isDev) {
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';

  // The renderer's Chromium can resolve `localhost` to ::1 while the vite dev
  // server listens on 0.0.0.0 (IPv4 only), so the HMR websocket gets
  // ERR_CONNECTION_REFUSED. Pin localhost to 127.0.0.1 so the renderer's HTTP
  // and WebSocket connections always reach the same listener.
  app.commandLine.appendSwitch('host-resolver-rules', 'MAP localhost 127.0.0.1');
}

// In production (packaged), resources are at process.resourcesPath
// extraResources from electron-builder places backend at process.resourcesPath/backend
const ROOT_DIR = isDev ? path.resolve(__dirname, '..') : process.resourcesPath;
const USER_DATA_DIR = app.getPath('userData');
const SERVER_CONFIG_PATH = path.join(USER_DATA_DIR, 'server-config.json');

let mainWindow = null;
let tray = null;
let isQuitting = false;

/**
 * Load the configured server URL from the config file.
 * Returns null if not configured (first launch).
 */
function getServerUrl() {
  try {
    if (fs.existsSync(SERVER_CONFIG_PATH)) {
      const config = JSON.parse(fs.readFileSync(SERVER_CONFIG_PATH, 'utf8'));
      return config.serverUrl || null;
    }
  } catch {
    // Config file corrupted or missing
  }
  return null;
}

/**
 * Save the server URL to the config file.
 * @param {string} url - The full server URL
 */
function saveServerUrl(url) {
  try {
    const config = { serverUrl: url };
    fs.writeFileSync(SERVER_CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
  } catch (err) {
    console.error('[Electron] Failed to save server config:', err);
  }
}

/**
 * Test server connection by calling the health endpoint.
 * @param {string} url - The server URL to test
 * @returns {Promise<boolean>} True if server is reachable
 */
async function testServerConnection(url) {
  try {
    const response = await fetch(`${url}/api/health`, {
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

// Ensure userData directory exists
if (!fs.existsSync(USER_DATA_DIR)) {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
}

// =============================================================================
// Server Connection Management
// =============================================================================

/**
 * Get the URL to load in the browser window.
 * If server is configured, load the remote server URL.
 * Otherwise, show the connection screen (handled by the frontend).
 */
function getLoadUrl() {
  const serverUrl = getServerUrl();
  if (serverUrl) {
    return serverUrl;
  }
  // No server configured — load the frontend which will show the connection screen
  // In dev mode, load Vite dev server; in production, load a blank page
  return isDev ? 'http://localhost:3000' : 'data:text/html,<html><body style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:system-ui;background:#f9f9f9"><p style="color:#444748">Loading Ecclesia CMS...</p></body></html>';
}

// =============================================================================
// Window Creation
// =============================================================================

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'ECCLESIA Church Management System',
    icon: path.join(__dirname, 'assets', 'icon-256.png'),
    // Frameless window — the app renders its own slim OS-style title bar
    // (brand, drag region + window controls) in TitleBar.tsx, above the nav.
    // The native title bar and application menu (File/Edit/View/...) are
    // removed; window controls are driven via the preload bridge.
    frame: false,
    backgroundColor: '#f8fafc', // slate-50, avoids white flash while loading
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    show: false, // Show after ready to avoid flicker
  });

  const loadUrl = getLoadUrl();

  // Surface preload failures loudly (e.g. sandbox/ESM mismatches) instead of
  // silently losing the window.electronAPI bridge.
  mainWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error('[Electron] Preload failed to load:', preloadPath, error);
  });

  // Load the app URL with retries: on a fresh install the packaged backend can
  // take a couple of seconds to finish cold-starting, so the first load attempt
  // may race it (ERR_CONNECTION_REFUSED). Retry until it connects (bounded), in
  // both dev and packaged modes.
  const loadAppUrl = (attempt = 0) => {
    mainWindow?.loadURL(loadUrl).catch((err) => {
      console.error('[Electron] Failed to load URL (attempt ' + (attempt + 1) + '):', err);
      if (attempt < 10) {
        setTimeout(() => loadAppUrl(attempt + 1), 1000);
      }
    });
  };
  loadAppUrl();

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    if (isDev) {
      mainWindow?.webContents.openDevTools({ mode: 'detach' });
    }
  });

  // Handle window close - minimize to tray instead of quitting
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Keep the renderer's custom title bar in sync with the maximize state
  // (so the maximize/restore button shows the right icon).
  const emitMaximized = () => {
    mainWindow?.webContents.send('window:maximized-changed', mainWindow?.isMaximized());
  };
  mainWindow.on('maximize', emitMaximized);
  mainWindow.on('unmaximize', emitMaximized);

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        shell.openExternal(url);
      }
    } catch {
      // Ignore invalid URLs
    }
    return { action: 'deny' };
  });
}

// =============================================================================
// System Tray
// =============================================================================

function createTray() {
  // Brand-consistent 32px tray glyph (dark rounded square + white cross),
  // resized for the tray (16px on Windows).
  const iconPath = path.join(__dirname, 'assets', 'icon-32.png');
  let trayIcon = nativeImage.createFromPath(iconPath);
  
  // Resize for tray (16x16 on Windows, 22x22 on macOS)
  trayIcon = trayIcon.resize({ width: 16, height: 16 });

  tray = new Tray(trayIcon);
  tray.setToolTip('ECCLESIA Church Management System');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open ECCLESIA',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);

  // Double-click tray icon to show window
  tray.on('double-click', () => {
    mainWindow?.show();
    mainWindow?.focus();
  });
}

// =============================================================================
// App Lifecycle
// =============================================================================

app.whenReady().then(async () => {
  try {
    createWindow();
    createTray();

    // macOS: re-create window when dock icon is clicked
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  } catch (err) {
    console.error('[Electron] Failed to start app:', err);
    dialog.showErrorBox('ECCLESIA Startup Error', `Failed to start the application:\n${err}`);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  // On macOS, keep app running in tray; on Windows/Linux, quit only if explicitly quitting
  if (process.platform !== 'darwin' && !isQuitting) {
    // Keep running in tray
  } else if (isQuitting) {
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
});

// =============================================================================
// IPC Handlers (secure communication from renderer)
// =============================================================================

ipcMain.handle('app:getVersion', () => app.getVersion());
ipcMain.handle('app:getPath', (_event, name) => app.getPath(name));

// Server configuration IPC handlers
ipcMain.handle('server:getUrl', () => getServerUrl());
ipcMain.handle('server:setUrl', (_event, url) => {
  saveServerUrl(url);
  return true;
});
ipcMain.handle('server:testConnection', async (_event, url) => {
  return testServerConnection(url);
});
ipcMain.handle('server:reload', () => {
  if (mainWindow) {
    const url = getLoadUrl();
    mainWindow.loadURL(url);
  }
});

// =============================================================================
// Custom Title Bar — Window Controls
// =============================================================================
// The frameless window renders its own minimize/maximize/close buttons inside
// the app header (Header.tsx). These handlers drive the native window.

ipcMain.on('window:minimize', () => mainWindow?.minimize());
ipcMain.on('window:toggleMaximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on('window:close', () => mainWindow?.close()); // close-to-tray (hide)
ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false);

// =============================================================================
// Hide the default application menu (File / Edit / View / Window / Help).
// Menu items are reachable via keyboard shortcuts (Ctrl+Shift+I for DevTools);
// the unified title bar intentionally shows no menu.
// =============================================================================

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
});

// =============================================================================
// Security: Prevent new window creation from renderer
// =============================================================================

app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (navEvent, url) => {
    const allowedOrigins = [new URL(LOAD_URL).origin];
    if (!allowedOrigins.some((origin) => url.startsWith(origin))) {
      navEvent.preventDefault();
    }
  });
});