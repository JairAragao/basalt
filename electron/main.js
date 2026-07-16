// main.js — processo principal do Electron.
// Sobe o backend Express EXISTENTE (server/index.js) numa porta livre, espera o
// listen e abre a janela carregando essa URL (mesma origem → /api funciona sem
// CORS nem proxy). Adiciona o diálogo NATIVO de pasta via IPC (o ganho sobre o
// navegador web do FolderPicker).

const path = require('path');
const { app, BrowserWindow, Menu, ipcMain, dialog, shell, session } = require('electron');
const { autoUpdater } = require('electron-updater');

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
const MIN_SPLASH_MS = 1400; // tempo mínimo de splash (a barra enche em ~1.2s)

// Splash de carregamento — abre instantânea (HTML mínimo) enquanto o backend
// sobe e o app carrega. Frameless, MESMO TAMANHO da janela principal, animação centralizada.
function createSplash() {
  splashWin = new BrowserWindow({
    width: 1280,
    height: 820,
    frame: false,
    center: true,
    backgroundColor: '#0a0a0b',
    skipTaskbar: true,
    alwaysOnTop: true, // fica por cima até fechar — o app não aparece "antes"
    // show:false até o conteúdo pintar. Mostrar antes causava um flash BRANCO
    // (janela 1280x820 não-maximizada, ainda sem conteúdo) antes do splash real.
    show: false,
  });
  splashWin.loadFile(path.join(__dirname, 'splash.html'));
  // Só maximiza + exibe quando a página já está pronta pra pintar (sem flash branco
  // nem "salto" de tamanho). O crono do tempo mínimo começa aqui.
  splashWin.once('ready-to-show', () => {
    if (!splashWin) return;
    splashWin.maximize();
    splashWin.show();
    splashAt = Date.now();
  });
  splashWin.on('closed', () => { splashWin = null; });
}

// Mostra a janela principal e fecha a splash (idempotente, respeitando o tempo mínimo).
function reveal() {
  if (revealed) return;
  const waited = splashAt ? Date.now() - splashAt : MIN_SPLASH_MS;
  if (waited < MIN_SPLASH_MS) { setTimeout(reveal, MIN_SPLASH_MS - waited); return; }
  revealed = true;
  if (mainWindow) {
    // maximize() já EXIBE a janela — por isso só chamamos aqui (não na criação),
    // senão o app apareceria antes da splash terminar.
    mainWindow.maximize();
    if (!mainWindow.isVisible()) mainWindow.show();
  }
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

// ── Auto-update (electron-updater › GitHub Releases) ─────────────────────────
// Checa o repo público JairAragao/basalt PERIODICAMENTE (no boot + a cada 3h,
// estilo VSCode): se houver release com versão maior (lê o latest.yml), baixa o
// instalador em background e AVISA DENTRO DO APP (banner "Reiniciar"), sem diálogo
// nativo intrusivo. Só no app EMPACOTADO. Repo público → sem token pro usuário.
// App não-assinado funciona (NSIS).
let updateTimer = null;
let updateReady = false; // listeners do autoUpdater já registrados?

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
    mainWindow.webContents.send(channel, payload);
  }
}
const sendUpdStatus = (state, extra) => sendToRenderer('update:status', { state, ...(extra || {}) });

// Registra os listeners do autoUpdater UMA vez. A POLÍTICA (checar no boot,
// intervalo, ligado/desligado) é dirigida pelo renderer (Configurações →
// Atualizações) via IPC — aqui só reagimos. Só faz sentido no app empacotado.
function setupAutoUpdate() {
  if (!app.isPackaged || updateReady) return;
  updateReady = true;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => sendUpdStatus('checking'));
  autoUpdater.on('update-available', (info) => sendUpdStatus('available', { version: info && info.version }));
  autoUpdater.on('update-not-available', () => sendUpdStatus('uptodate'));
  autoUpdater.on('download-progress', (p) => sendUpdStatus('downloading', { percent: Math.round((p && p.percent) || 0) }));
  autoUpdater.on('update-downloaded', (info) => sendUpdStatus('downloaded', { version: info && info.version }));
  autoUpdater.on('error', (e) => { console.error('[updater]', (e && e.message) || e); sendUpdStatus('error', { error: (e && e.message) || String(e) }); });
}

function runUpdateCheck() {
  if (!app.isPackaged) return Promise.resolve({ ok: false, reason: 'dev' });
  setupAutoUpdate();
  return autoUpdater.checkForUpdates()
    .then(() => ({ ok: true }))
    .catch((e) => { const msg = (e && e.message) || String(e); console.error('[updater] check', msg); return { ok: false, error: msg }; });
}

// Aplica o intervalo de auto-checagem (ms). 0/negativo = desligado (sem timer).
function applyUpdateInterval(ms) {
  if (updateTimer) { clearInterval(updateTimer); updateTimer = null; }
  if (!app.isPackaged) return;
  setupAutoUpdate();
  const n = Number(ms) || 0;
  if (n > 0) updateTimer = setInterval(() => { runUpdateCheck(); }, n);
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

// ── IPC: auto-update (checagem / intervalo / instalar) ───────────────────────
ipcMain.handle('update:check', async () => runUpdateCheck());
ipcMain.handle('update:isPackaged', () => app.isPackaged);
ipcMain.on('update:setInterval', (_e, ms) => applyUpdateInterval(ms));
ipcMain.on('update:install', () => {
  try { autoUpdater.quitAndInstall(); } catch (e) { console.error('[updater] install', (e && e.message) || e); }
});

app.whenReady().then(async () => {
  // CSP (defense-in-depth): o XSS já está fechado (markdown `html:false`), mas isto
  // barra exfiltração caso uma regressão reabra HTML. App é offline/same-origin:
  // só /api ('self') + data:/blob: pra imagens (assets + base64). Ajuste se quebrar.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
          "img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; " +
          "object-src 'none'; base-uri 'self'",
        ],
      },
    });
  });

  createSplash(); // splash instantânea enquanto o backend sobe + o app carrega
  try {
    const url = await startServer();
    createWindow(url);
    // registra os listeners do updater; a checagem/intervalo é dirigida pelo
    // renderer (Configurações → Atualizações) — inclusive a checagem no boot.
    setupAutoUpdate();
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
  if (updateTimer) { try { clearInterval(updateTimer); } catch { /* noop */ } updateTimer = null; }
  if (serverListener) { try { serverListener.close(); } catch { /* noop */ } }
});
