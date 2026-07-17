const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lbhApp', Object.freeze({
  quit: () => ipcRenderer.invoke('lbh:quit-app'),
}));
