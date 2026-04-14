const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lbhStatus', {
  getSnapshot: () => ipcRenderer.invoke('lbh:stack-status'),
  openMainWindow: () => ipcRenderer.invoke('lbh:focus-main-window'),
});
