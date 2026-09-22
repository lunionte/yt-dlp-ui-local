/**
 * Electron Main Process — yt-dlp GUI Desktop
 *
 * Inicializa o servidor Express internamente (mesmo processo Node.js),
 * abre uma BrowserWindow apontando para localhost, e gerencia o System Tray.
 *
 * Performance & Memory:
 * - Janela criada com show:false + ready-to-show (sem flash branco)
 * - contextIsolation:true + nodeIntegration:false (segurança e isolamento)
 * - Referências nulas após destroy (sem memory leak)
 * - Single instance lock (impede múltiplas instâncias)
 * - Graceful shutdown do Express e cleanup do tray
 */

import { app, BrowserWindow, ipcMain, nativeImage, Notification } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createTray, destroyTray, getMinimizeToTray } from './tray.js';

import fs from 'node:fs';

// ─── Constants & Paths ──────────────────────────────────────────────
const IS_DEV = !app.isPackaged;

function resolveAppRoot(): string {
  if (app.isPackaged) {
    return app.getAppPath();
  }
  const candidates = [
    app.getAppPath(),
    process.cwd(),
    path.resolve(app.getAppPath(), '..'),
    path.resolve(process.cwd(), '..'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'backend', 'dist', 'server.js'))) {
      return dir;
    }
  }
  return app.getAppPath();
}

const APP_ROOT = resolveAppRoot();
const PORT = 3001;

// ─── Environment (ANTES de qualquer import do backend) ──────────────
process.env.ELECTRON = '1';
process.env.APP_ROOT = APP_ROOT;
process.env.PORT = String(PORT);

// Em modo empacotado, config.json vai para a pasta de dados do usuário
if (app.isPackaged) {
  process.env.ELECTRON_USER_DATA = app.getPath('userData');
}

// ─── Single Instance Lock ───────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

// ─── State ──────────────────────────────────────────────────────────
let win: BrowserWindow | null = null;
let isQuitting = false;
let serverHandle: { close: (cb?: () => void) => void } | null = null;

// ─── Icon ───────────────────────────────────────────────────────────
function getAppIcon(): Electron.NativeImage {
  const iconPath = IS_DEV
    ? path.join(APP_ROOT, 'desktop', 'resources', 'icon.ico')
    : path.join(process.resourcesPath, 'icon.ico');

  try {
    return nativeImage.createFromPath(iconPath);
  } catch {
    return nativeImage.createEmpty();
  }
}

// ─── Window ─────────────────────────────────────────────────────────
function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,               // mostra após ready-to-show (sem flash branco)
    icon: getAppIcon(),
    title: 'yt-dlp GUI',
    backgroundColor: '#f8fafc', // slate-50 (combina com o tema Pillowcase)
    autoHideMenuBar: true,      // sem menu nativo
    webPreferences: {
      preload: path.join(import.meta.dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
      devTools: IS_DEV,
    },
  });

  // ── Exibir somente quando o conteúdo estiver pronto ──
  window.once('ready-to-show', () => {
    if (process.env.ELECTRON_SMOKE_TEST === '1') {
      console.log('[SMOKE_TEST] Window ready-to-show, backend operational, smoke test passed!');
      setTimeout(() => {
        app.quit();
      }, 500);
      return;
    }
    window.show();
    window.focus();
  });

  // ── Minimizar para bandeja ao fechar (se ativado) ──
  window.on('close', (e) => {
    if (!isQuitting && getMinimizeToTray()) {
      e.preventDefault();
      window.hide();
    }
  });

  // ── Minimizar para bandeja ao minimizar (se ativado) ──
  window.on('minimize', () => {
    if (getMinimizeToTray()) {
      window.hide();
      window.restore(); // Restaura estado interno para que show() funcione corretamente
    }
  });

  // ── Cleanup de referência após destruição ──
  window.on('closed', () => {
    win = null;
  });

  // ── Carregar a aplicação ──
  window.loadURL(`http://localhost:${PORT}`);

  return window;
}

// ─── IPC Handlers ───────────────────────────────────────────────────
function setupIPC(): void {
  ipcMain.handle('get-app-version', () => app.getVersion());
  ipcMain.handle('is-electron', () => true);

  ipcMain.handle('show-notification', (_event, title: string, body: string) => {
    if (Notification.isSupported()) {
      new Notification({ title, body, icon: getAppIcon() }).show();
    }
  });
}

// ─── Backend Startup ────────────────────────────────────────────────
async function startBackend(): Promise<void> {
  const serverPath = path.join(APP_ROOT, 'backend', 'dist', 'server.js');
  const serverUrl = pathToFileURL(serverPath).href;

  const serverModule = await import(serverUrl);

  if (typeof serverModule.startServer === 'function') {
    serverHandle = serverModule.startServer(PORT);
  }
}

// ─── App Lifecycle ──────────────────────────────────────────────────
app.on('ready', async () => {
  setupIPC();

  try {
    await startBackend();
  } catch (err) {
    console.error('[Electron] Falha ao iniciar backend:', err);
    app.quit();
    return;
  }

  win = createWindow();
  createTray(win);
});

// Quando o usuário tenta abrir uma segunda instância, restaura a janela existente
app.on('second-instance', () => {
  if (win) {
    if (!win.isVisible()) win.show();
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('will-quit', () => {
  destroyTray();

  // Encerra o servidor Express graciosamente
  if (serverHandle) {
    serverHandle.close();
    serverHandle = null;
  }
});

// Não encerra o app quando todas as janelas fecham (fica no tray)
app.on('window-all-closed', () => {
  if (!getMinimizeToTray() || isQuitting) {
    app.quit();
  }
});
