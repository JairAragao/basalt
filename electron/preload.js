// preload.js — ponte segura entre renderer (Vue) e main process.
// Expõe SÓ o necessário via contextBridge (contextIsolation: true).

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  isElectron: true,
  // Diálogo nativo de pasta; resolve com o caminho escolhido ou null.
  pickFolder: () => ipcRenderer.invoke('dialog:pickFolder'),
  // Renderer avisa que terminou de carregar → main fecha a splash e mostra a janela.
  signalReady: () => ipcRenderer.send('app:ready'),
  // Auto-update (electron-updater): status vindo do main + ações.
  update: {
    isElectron: true,
    // status: { state:'checking'|'available'|'uptodate'|'downloading'|'downloaded'|'error', version?, percent?, error? }
    onStatus: (cb) => {
      const h = (_e, s) => cb(s);
      ipcRenderer.on('update:status', h);
      return () => ipcRenderer.removeListener('update:status', h);
    },
    // é app empacotado? (updater só roda no empacotado)
    isPackaged: () => ipcRenderer.invoke('update:isPackaged'),
    // checagem manual → { ok, error?, reason? }
    check: () => ipcRenderer.invoke('update:check'),
    // define o intervalo de auto-checagem em ms (0 = desligado)
    setInterval: (ms) => ipcRenderer.send('update:setInterval', ms),
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
