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

import { app, BrowserWindow, dialog, ipcMain, nativeImage, Notification, shell } from 'electron';
import path from 'node:path';
import { once } from 'node:events';
import type { Server } from 'node:http';
import type { IpcMainInvokeEvent } from 'electron';
import { BrowseSchema, OpenFolderSchema } from '@ytdlp/shared';
import { z } from 'zod';
import { pathToFileURL } from 'node:url';
import { createTray, destroyTray, getMinimizeToTray } from './tray.js';
import { createQuitGuard } from './lifecycle.js';

import fs from 'node:fs';

// ─── Constants & Paths ──────────────────────────────────────────────
const IS_DEV = !app.isPackaged;
if (!IS_DEV) process.env.NODE_ENV = 'production';

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
let activePort = 3001;

// ─── Environment (ANTES de qualquer import do backend) ──────────────
process.env.ELECTRON = '1';
process.env.APP_ROOT = APP_ROOT;

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
let serverHandle: Server | null = null;

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

function resolvePreloadPath(): string {
  const candidates = [
    path.join(import.meta.dirname, 'preload.cjs'),
    path.join(app.getAppPath(), 'dist', 'preload.cjs'),
    path.join(APP_ROOT, 'desktop', 'dist', 'preload.cjs'),
    path.join(APP_ROOT, 'dist', 'preload.cjs'),
    path.join(import.meta.dirname, 'preload.js'),
    path.join(app.getAppPath(), 'dist', 'preload.js'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return path.join(import.meta.dirname, 'preload.cjs');
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
    frame: false,               // Janela sem borda para controles customizados em React
    webPreferences: {
      preload: resolvePreloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
      devTools: IS_DEV,
    },
  });

  // ── Log de falhas de carregamento do preload ──
  window.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error('[Electron] Falha ao executar script preload:', preloadPath, error);
  });

  // ── Notificar renderer sobre alterações no estado de maximização ──
  window.on('maximize', () => {
    window.webContents.send('window-maximized-change', true);
  });

  window.on('unmaximize', () => {
    window.webContents.send('window-maximized-change', false);
  });

  // ── Bloquear navegações não autorizadas e abrir links externos no navegador padrão ──
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      void shell.openExternal(url).catch(() => console.error('[Electron] Falha ao abrir link externo'));
    }
    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, navigationUrl) => {
    try {
      const parsed = new URL(navigationUrl);
      if (parsed.origin !== `http://127.0.0.1:${activePort}`) {
        event.preventDefault();
        if (['http:', 'https:'].includes(parsed.protocol)) void shell.openExternal(navigationUrl).catch(() => console.error('[Electron] Falha ao abrir link externo'));
      }
    } catch {
      event.preventDefault();
    }
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
  window.loadURL(`http://127.0.0.1:${activePort}`);

  return window;
}

// ─── IPC Handlers ───────────────────────────────────────────────────
function handle(channel: string, callback: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown): void {
  ipcMain.handle(channel, (event, ...args: unknown[]) => {
    if (!win || event.sender !== win.webContents || event.senderFrame !== event.sender.mainFrame || new URL(event.senderFrame.url).origin !== `http://127.0.0.1:${activePort}`) throw new Error('Origem IPC não autorizada');
    return callback(event, ...args);
  });
}
function setupIPC(): void {
  handle('get-app-version', () => app.getVersion());
  handle('is-electron', () => true);

  handle('show-notification', (_event, rawTitle: unknown, rawBody: unknown) => {
    const title = z.string().max(500).parse(rawTitle);
    const body = z.string().max(2000).parse(rawBody);
    if (Notification.isSupported()) {
      new Notification({ title, body, icon: getAppIcon() }).show();
    }
  });

  handle('select-folder', async (_event, rawPath?: unknown) => {
    const { defaultPath } = BrowseSchema.parse({ type: 'folder', defaultPath: rawPath });
    if (defaultPath) await serverModuleInstance!.requireDirectory(defaultPath);
    const parentWindow = win || BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    if (!parentWindow) return { path: null, cancelled: true };

    const result = await dialog.showOpenDialog(parentWindow, {
      title: 'Selecione a pasta de download',
      defaultPath: defaultPath || undefined,
      properties: ['openDirectory', 'createDirectory'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return { path: null, cancelled: true };
    }
    return { path: result.filePaths[0], cancelled: false };
  });

  handle('open-folder', async (_event, rawPath: unknown) => {
    try {
      const { folderPath } = OpenFolderSchema.parse({ folderPath: rawPath });
      if (!folderPath) throw new Error('Informe uma pasta');
      const target = await serverModuleInstance!.requireDirectory(folderPath);
      const error = await shell.openPath(target);
      return error ? { success: false, error: 'Não foi possível abrir a pasta.' } : { success: true };
    } catch { return { success: false, error: 'A pasta precisa ser um diretório absoluto existente.' }; }
  });

  // ── Controles de Janela (Frameless) ──
  handle('window-minimize', () => {
    const targetWin = win || BrowserWindow.getFocusedWindow();
    if (targetWin) targetWin.minimize();
  });

  handle('window-maximize', () => {
    const targetWin = win || BrowserWindow.getFocusedWindow();
    if (targetWin) {
      if (targetWin.isMaximized()) {
        targetWin.unmaximize();
      } else {
        targetWin.maximize();
      }
    }
  });

  handle('window-close', () => {
    const targetWin = win || BrowserWindow.getFocusedWindow();
    if (targetWin) targetWin.close();
  });

  handle('window-is-maximized', () => {
    const targetWin = win || BrowserWindow.getFocusedWindow();
    return targetWin ? targetWin.isMaximized() : false;
  });
}

interface BackendModule { startServer: (port?: number) => Server; stopServer: (server?: Server) => Promise<void>; requireDirectory: (input: string, writable?: boolean) => Promise<string>; }
let serverModuleInstance: BackendModule | null = null;

// ─── Backend Startup ────────────────────────────────────────────────
async function startBackend(): Promise<void> {
  activePort = 0;

  const serverPath = path.join(APP_ROOT, 'backend', 'dist', 'server.js');
  const serverUrl = pathToFileURL(serverPath).href;

  serverModuleInstance = await import(serverUrl) as BackendModule;

  if (typeof serverModuleInstance.startServer === 'function') {
    serverHandle = serverModuleInstance.startServer(activePort);
    await once(serverHandle, 'listening');
    const address = serverHandle.address();
    if (!address || typeof address === 'string') throw new Error('Backend sem porta válida');
    activePort = address.port;
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

app.on('before-quit', createQuitGuard(async () => {
  if (serverModuleInstance) await serverModuleInstance.stopServer(serverHandle || undefined);
  else if (serverHandle) await new Promise<void>(resolve => serverHandle!.close(() => resolve()));
  serverHandle = null;
  destroyTray();
}, () => app.quit(), error => {
  isQuitting = false;
  console.error('[Electron] Encerramento não confirmado:', error);
  dialog.showErrorBox('Falha ao encerrar', 'Não foi possível confirmar o encerramento das tarefas. Tente sair novamente.');
}));

// Não encerra o app quando todas as janelas fecham (fica no tray)
app.on('window-all-closed', () => {
  if (!getMinimizeToTray() || isQuitting) {
    app.quit();
  }
});
