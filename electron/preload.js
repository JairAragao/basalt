// preload.js — ponte segura entre renderer (Vue) e main process.
// Expõe SÓ o necessário via contextBridge (contextIsolation: true).

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  isElectron: true,
  // Abre o diálogo nativo de pasta; resolve com o caminho escolhido ou null.
  pickFolder: () => ipcRenderer.invoke('dialog:pickFolder'),
});
