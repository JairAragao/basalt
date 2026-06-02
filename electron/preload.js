// preload.js — ponte segura entre renderer (Vue) e main process.
// Expõe SÓ o necessário via contextBridge (contextIsolation: true).

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  isElectron: true,
  // Diálogo nativo de pasta; resolve com o caminho escolhido ou null.
  pickFolder: () => ipcRenderer.invoke('dialog:pickFolder'),
  // Renderer avisa que terminou de carregar → main fecha a splash e mostra a janela.
  signalReady: () => ipcRenderer.send('app:ready'),
  // Controles da janela (barra de título custom, frameless).
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    onMaximizeChange: (cb) => {
      const handler = (_e, val) => cb(!!val);
      ipcRenderer.on('window:maximized', handler);
      return () => ipcRenderer.removeListener('window:maximized', handler);
    },
  },
});
