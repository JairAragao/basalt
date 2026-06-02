// main.js — processo principal do Electron.
// Sobe o backend Express EXISTENTE (server/index.js) numa porta livre, espera o
// listen e abre a janela carregando essa URL (mesma origem → /api funciona sem
// CORS nem proxy). Adiciona o diálogo NATIVO de pasta via IPC (o ganho sobre o
// navegador web do FolderPicker).

const path = require('path');
const { app, BrowserWindow, Menu, ipcMain, dialog, shell } = require('electron');

// Sem menu de aplicação padrão (File/Edit/View/...). A navegação é toda na UI.
Menu.setApplicationMenu(null);

// Garante instância única (evita 2 backends/janelas).
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let mainWindow = null;
let splashWin = null;
let serverListener = null;
let revealed = false;
let splashAt = 0;
const MIN_SPLASH_MS = 1600; // tempo mínimo de splash (pra dar pra ver a animação)

// Splash de carregamento — abre instantânea (HTML mínimo) enquanto o backend
// sobe e o app carrega. Frameless, MESMO TAMANHO da janela principal, animação centralizada.
function createSplash() {
  splashWin = new BrowserWindow({
    width: 1280,
    height: 820,
    frame: false,
    center: true,
    backgroundColor: '#0c0c0d',
    skipTaskbar: true,
    show: true,
  });
  splashWin.loadFile(path.join(__dirname, 'splash.html'));
  splashWin.on('closed', () => { splashWin = null; });
  splashAt = Date.now();
}

// Mostra a janela principal e fecha a splash (idempotente, respeitando o tempo mínimo).
function reveal() {
  if (revealed) return;
  const waited = splashAt ? Date.now() - splashAt : MIN_SPLASH_MS;
  if (waited < MIN_SPLASH_MS) { setTimeout(reveal, MIN_SPLASH_MS - waited); return; }
  revealed = true;
  if (mainWindow && !mainWindow.isVisible()) mainWindow.show();
  if (splashWin) { splashWin.close(); splashWin = null; }
}

function createWindow(url) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 640,
    show: false, // só mostra quando o renderer sinaliza pronto (fecha a splash)
    backgroundColor: '#171717', // evita flash branco; combina com o tema dark
    title: 'Basalt',
    icon: path.join(__dirname, '..', 'basalt.png'),
    frame: false, // janela sem moldura — usamos uma barra de título custom (com abas)
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadURL(url);

  // Revela quando o app avisar que está pronto (IPC) — com fallbacks de segurança.
  mainWindow.webContents.once('did-finish-load', () => setTimeout(reveal, 6000));
  setTimeout(reveal, 12000); // hard fallback (caso algo trave)

  // Informa o renderer quando (des)maximiza — pro botão alternar o ícone.
  const sendMax = () => mainWindow && mainWindow.webContents.send('window:maximized', mainWindow.isMaximized());
  mainWindow.on('maximize', sendMax);
  mainWindow.on('unmaximize', sendMax);

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

// ── IPC: controles da janela (barra de título custom, frameless) ─────────────
ipcMain.on('window:minimize', () => mainWindow && mainWindow.minimize());
ipcMain.on('window:maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) mainWindow.unmaximize();
  else mainWindow.maximize();
});
ipcMain.on('window:close', () => mainWindow && mainWindow.close());
ipcMain.handle('window:isMaximized', () => !!(mainWindow && mainWindow.isMaximized()));

// Renderer terminou de carregar (bootstrap pronto) → mostra a janela, fecha a splash.
ipcMain.on('app:ready', () => reveal());

app.whenReady().then(async () => {
  createSplash(); // splash instantânea enquanto o backend sobe + o app carrega
  try {
    const url = await startServer();
    createWindow(url);
  } catch (e) {
    if (splashWin) { splashWin.close(); splashWin = null; }
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
