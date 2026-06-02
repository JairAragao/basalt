// main.js — processo principal do Electron.
// Sobe o backend Express EXISTENTE (server/index.js) numa porta livre, espera o
// listen e abre a janela carregando essa URL (mesma origem → /api funciona sem
// CORS nem proxy). Adiciona o diálogo NATIVO de pasta via IPC (o ganho sobre o
// navegador web do FolderPicker).

const path = require('path');
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');

// Garante instância única (evita 2 backends/janelas).
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let mainWindow = null;
let serverListener = null;

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 640,
    backgroundColor: '#171717', // evita flash branco; combina com o tema dark
    title: 'Basalt',
    icon: path.join(__dirname, '..', 'basalt.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(url);

  // Links externos abrem no navegador padrão, não numa janela Electron.
  mainWindow.webContents.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:\/\//.test(target)) {
      shell.openExternal(target);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// Sobe o backend numa porta livre (0 = SO escolhe) e devolve a URL pronta.
function startServer() {
  return new Promise((resolve, reject) => {
    let appServer;
    try {
      // Requerer dispara config.load() + watcher; o listen NÃO roda no require
      // (guard require.main === module em server/index.js) — controlamos aqui.
      appServer = require(path.join(__dirname, '..', 'server', 'index.js'));
    } catch (e) {
      return reject(e);
    }
    serverListener = appServer.listen(0, '127.0.0.1', () => {
      const { port } = serverListener.address();
      const url = `http://127.0.0.1:${port}`;
      console.log(`[basalt] backend pronto em ${url}`);
      resolve(url);
    });
    serverListener.on('error', reject);
  });
}

// ── IPC: diálogo NATIVO de seleção de pasta (vault) ──────────────────────────
ipcMain.handle('dialog:pickFolder', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Escolha a pasta do vault',
    properties: ['openDirectory', 'createDirectory'],
  });
  return res.canceled || !res.filePaths.length ? null : res.filePaths[0];
});

app.whenReady().then(async () => {
  try {
    const url = await startServer();
    createWindow(url);
  } catch (e) {
    dialog.showErrorBox('Basalt — falha ao iniciar', String((e && e.message) || e));
    app.quit();
  }

  app.on('activate', () => {
    // macOS: recria a janela ao clicar no dock se nenhuma estiver aberta.
    if (BrowserWindow.getAllWindows().length === 0 && serverListener) {
      const { port } = serverListener.address();
      createWindow(`http://127.0.0.1:${port}`);
    }
  });
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on('window-all-closed', () => {
  // macOS costuma manter o app vivo; nas demais plataformas, encerra.
  if (process.platform !== 'darwin') app.quit();
});

app.on('quit', () => {
  if (serverListener) { try { serverListener.close(); } catch { /* noop */ } }
});
