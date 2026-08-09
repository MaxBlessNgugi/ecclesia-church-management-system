// =============================================================================
// ECCLESIA Electron Preload Script
// =============================================================================
// Secure bridge between main and renderer processes using contextBridge.
// Only exposes safe, explicitly allowed APIs to the renderer.
// =============================================================================

import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // App information
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  getPath: (name) => ipcRenderer.invoke('app:getPath', name),

  // Platform info
  platform: process.platform,
  isElectron: true,
});