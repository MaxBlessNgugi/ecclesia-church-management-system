// =============================================================================
// ECCLESIA Electron Main Process
// =============================================================================
// Starts the Express backend, creates the BrowserWindow, manages system tray,
// and handles "close to tray" behavior for a native desktop experience.
// =============================================================================

import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, dialog } from 'electron';
import { spawn, ChildProcess } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDev = !app.isPackaged;

// In production (packaged), resources are at process.resourcesPath
// extraResources from electron-builder places backend at process.resourcesPath/backend
const ROOT_DIR = isDev ? path.resolve(__dirname, '..') : process.resourcesPath;
const BACKEND_DIR = path.join(ROOT_DIR, 'backend');
const USER_DATA_DIR = app.getPath('userData');
const DB_PATH = path.join(USER_DATA_DIR, 'ecclesia.db');

let backendProcess: ChildProcess | null = null;
let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

// Ensure userData directory exists
if (!fs.existsSync(USER_DATA_DIR)) {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
}

// Set DATABASE_URL for the backend process BEFORE spawning it
process.env.DATABASE_URL = `file:${DB_PATH}`;

// =============================================================================
// Backend Process Management
// =============================================================================

function startBackend(): Promise<void> {
  return new Promise((resolve, reject) => {
    const isBackendBuilt = fs.existsSync(path.join(BACKEND_DIR, 'dist', 'index.js'));
    const command = isDev ? 'tsx' : 'node';
    const args = isDev ? ['watch', 'src/index.ts'] : ['dist/index.js'];
    const env = { ...process.env, DATABASE_URL: `file:${DB_PATH}`, PORT: '5000' };

    console.log('[Electron] Starting backend...', { command, args, cwd: BACKEND_DIR, dbPath: DB_PATH });

    backendProcess = spawn(command, args, {
      cwd: BACKEND_DIR,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });

    backendProcess.stdout?.on('data', (data) => {
      const output = data.toString().trim();
      console.log('[Backend]', output);
      if (output.includes('Ecclesia Server running') || output.includes('running on http://localhost:5000')) {
        resolve();
      }
    });

    backendProcess.stderr?.on('data', (data) => {
      console.error('[Backend ERROR]', data.toString().trim());
    });

    backendProcess.on('error', (err) => {
      console.error('[Electron] Failed to start backend:', err);
      reject(err);
    });

    backendProcess.on('exit', (code, signal) => {
      if (!isQuitting) {
        console.log('[Electron] Backend exited unexpectedly:', { code, signal });
        // Could implement auto-restart here if needed
      }
      backendProcess = null;
    });

    // Timeout fallback
    setTimeout(() => resolve(), 8000);
  });
}

function stopBackend(): void {
  if (backendProcess) {
    console.log('[Electron] Stopping backend...');
    backendProcess.kill('SIGTERM');
    backendProcess = null;
  }
}

// =============================================================================
// Window Creation
// =============================================================================

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'ECCLESIA Church Management System',
    icon: path.join(__dirname, 'assets', 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    show: false, // Show after ready to avoid flicker
  });

  const loadUrl = isDev ? 'http://localhost:3000' : 'http://127.0.0.1:5000';

  mainWindow.loadURL(loadUrl).catch((err) => {
    console.error('[Electron] Failed to load URL:', err);
    if (isDev) {
      // Retry in dev if Vite isn't ready yet
      setTimeout(() => mainWindow?.loadURL(loadUrl), 1000);
    }
  });

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

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    require('electron').shell.openExternal(url);
    return { action: 'deny' };
  });
}

// =============================================================================
// System Tray
// =============================================================================

function createTray(): void {
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
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
    await startBackend();
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
    stopBackend();
    app.quit();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
  stopBackend();
});

// =============================================================================
// IPC Handlers (secure communication from renderer)
// =============================================================================

ipcMain.handle('app:getVersion', () => app.getVersion());
ipcMain.handle('app:getPath', (_, name: keyof Electron.App) => app.getPath(name));

// =============================================================================
// Security: Prevent new window creation from renderer
// =============================================================================

app.on('web-contents-created', (_event, contents) => {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));
  contents.on('will-navigate', (navEvent, url) => {
    const allowedOrigins = isDev ? ['http://localhost:3000'] : ['http://127.0.0.1:5000'];
    if (!allowedOrigins.some((origin) => url.startsWith(origin))) {
      navEvent.preventDefault();
    }
  });
});