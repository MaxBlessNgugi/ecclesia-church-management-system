// =============================================================================
// ECCLESIA Electron Preload Script (CommonJS)
// =============================================================================
// Secure bridge between main and renderer processes using contextBridge.
// Only exposes safe, explicitly allowed APIs to the renderer.
//
// NOTE: This file MUST stay CommonJS. The BrowserWindow uses `sandbox: true`,
// and sandboxed preload scripts cannot use ESM (`import`) — Electron bundles
// them as plain CommonJS. The `.cjs` extension also forces CommonJS even
// though package.json has `"type": "module"`. An ESM preload fails to load
// with "Cannot use import statement outside a module" and silently drops the
// window.electronAPI bridge.
// =============================================================================

const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // App information
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  getPath: (name) => ipcRenderer.invoke('app:getPath', name),

  // Platform info
  platform: process.platform,
  isElectron: true,

  // Custom title bar window controls (frameless window)
  windowControls: {
    minimize: () => ipcRenderer.send('window:minimize'),
    toggleMaximize: () => ipcRenderer.send('window:toggleMaximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    // Subscribe to maximize/restore changes; returns an unsubscribe fn.
    onMaximizeChange: (callback) => {
      const listener = (_event, maximized) => callback(maximized);
      ipcRenderer.on('window:maximized-changed', listener);
      return () => ipcRenderer.removeListener('window:maximized-changed', listener);
    },
  },
});
