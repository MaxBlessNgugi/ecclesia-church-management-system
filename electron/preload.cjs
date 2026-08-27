// ECCLESIA Electron Preload — must be CommonJS (sandbox: true).
const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
});
