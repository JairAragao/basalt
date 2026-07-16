// preload.js — ponte segura entre renderer (Vue) e main process.
// Expõe SÓ o necessário via contextBridge (contextIsolation: true).

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  isElectron: true,
  // Diálogo nativo de pasta; resolve com o caminho escolhido ou null.
  pickFolder: () => ipcRenderer.invoke('dialog:pickFolder'),
  // Renderer avisa que terminou de carregar → main fecha a splash e mostra a janela.
  signalReady: () => ipcRenderer.send('app:ready'),
  // Auto-update (electron-updater): eventos vindos do main + ações.
  update: {
    // dispara quando há versão nova (começou a baixar)
    onAvailable: (cb) => {
      const h = (_e, info) => cb(info);
      ipcRenderer.on('update:available', h);
      return () => ipcRenderer.removeListener('update:available', h);
    },
    // dispara quando o download terminou (pronto pra instalar)
    onDownloaded: (cb) => {
      const h = (_e, info) => cb(info);
      ipcRenderer.on('update:downloaded', h);
      return () => ipcRenderer.removeListener('update:downloaded', h);
    },
    // checagem manual sob demanda → { ok, error? }
    check: () => ipcRenderer.invoke('update:check'),
    // reinicia e instala a atualização baixada
    install: () => ipcRenderer.send('update:install'),
  },
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
