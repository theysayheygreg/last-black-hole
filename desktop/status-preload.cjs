const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lbhStatus', {
  getSnapshot: () => ipcRenderer.invoke('lbh:stack-status'),
  openMainWindow: () => ipcRenderer.invoke('lbh:focus-main-window'),
  copyText: (text) => ipcRenderer.invoke('lbh:copy-text', String(text || '')),
  exportText: (payload) => ipcRenderer.invoke('lbh:export-text', {
    defaultPath: String(payload?.defaultPath || 'last-singularity-status.txt'),
    text: String(payload?.text || ''),
  }),
});
