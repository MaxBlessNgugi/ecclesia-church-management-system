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
  getPath: (name: keyof Electron.App) => ipcRenderer.invoke('app:getPath', name),

  // Platform info
  platform: process.platform,
  isElectron: true,

  // Example: You can add more secure IPC channels here as needed
  // onBackendStatus: (callback: (status: string) => void) => {
  //   ipcRenderer.on('backend:status', (_event, status) => callback(status));
  //   return () => ipcRenderer.removeAllListeners('backend:status');
  // },
});

// Type declarations for the exposed API (for TypeScript in renderer)
// This allows the frontend to use `window.electronAPI` with type safety
declare global {
  interface Window {
    electronAPI: {
      getVersion: () => Promise<string>;
      getPath: (name: keyof Electron.App) => Promise<string>;
      platform: NodeJS.Platform;
      isElectron: boolean;
    };
  }
}