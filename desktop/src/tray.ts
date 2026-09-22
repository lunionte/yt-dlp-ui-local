/**
 * System Tray — Gerenciamento do ícone na bandeja do sistema Windows.
 *
 * Funcionalidades:
 * - Ícone na bandeja com tooltip e versão
 * - Menu de contexto (botão direito):
 *   • "Abrir yt-dlp GUI" — restaura a janela
 *   • "Minimizar para bandeja ao fechar" — checkbox toggle
 *   • "Sair" — encerra completamente o app
 * - Clique duplo no ícone — restaura a janela
 *
 * O toggle de "minimizar para bandeja" controla:
 * - Fechar janela (X) → oculta em vez de fechar
 * - Minimizar janela → oculta em vez de minimizar na taskbar
 */

import { Tray, Menu, nativeImage, app } from 'electron';
import type { BrowserWindow } from 'electron';
import path from 'node:path';
import fs from 'node:fs';

// ─── State & Persistence ───────────────────────────────────────────
let tray: Tray | null = null;
let minimizeToTray = true;

function getPreferencesPath(): string {
  return path.join(app.getPath('userData'), 'desktop-preferences.json');
}

function loadPreferences(): void {
  try {
    const prefPath = getPreferencesPath();
    if (fs.existsSync(prefPath)) {
      const data = JSON.parse(fs.readFileSync(prefPath, 'utf-8'));
      if (typeof data.minimizeToTray === 'boolean') {
        minimizeToTray = data.minimizeToTray;
      }
    }
  } catch {
    // Mantém padrão caso falhe a leitura
  }
}

function savePreferences(): void {
  try {
    const prefPath = getPreferencesPath();
    const dir = path.dirname(prefPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(prefPath, JSON.stringify({ minimizeToTray }, null, 2), 'utf-8');
  } catch {
    // Ignora erro de gravação de preferência não-essencial
  }
}

/** Retorna se o comportamento de minimizar para bandeja está ativado */
export function getMinimizeToTray(): boolean {
  return minimizeToTray;
}

/** Cria o ícone na bandeja e configura o menu de contexto */
export function createTray(win: BrowserWindow): void {
  loadPreferences();

  const IS_DEV = !app.isPackaged;
  const APP_ROOT = process.env.APP_ROOT!;

  const iconPath = IS_DEV
    ? path.join(APP_ROOT, 'desktop', 'resources', 'icon.ico')
    : path.join(process.resourcesPath, 'icon.ico');

  let icon: Electron.NativeImage;
  try {
    icon = nativeImage.createFromPath(iconPath);
    // Redimensiona para tamanho de bandeja (16×16 no Windows)
    icon = icon.resize({ width: 16, height: 16 });
  } catch {
    icon = nativeImage.createEmpty();
  }

  tray = new Tray(icon);
  tray.setToolTip(`yt-dlp GUI v${app.getVersion()}`);

  const restoreWindow = () => {
    if (!win.isVisible()) {
      win.show();
    }
    if (win.isMinimized()) {
      win.restore();
    }
    win.focus();
  };

  // ── Construir e aplicar menu de contexto ──
  const buildMenu = (): Menu =>
    Menu.buildFromTemplate([
      {
        label: 'Abrir yt-dlp GUI',
        click: restoreWindow,
      },
      { type: 'separator' },
      {
        label: 'Minimizar para a bandeja ao fechar/minimizar',
        type: 'checkbox',
        checked: minimizeToTray,
        click: (menuItem) => {
          minimizeToTray = menuItem.checked;
          savePreferences();
          // Reconstruir menu para refletir novo estado
          if (tray) tray.setContextMenu(buildMenu());
        },
      },
      { type: 'separator' },
      {
        label: 'Sair do yt-dlp GUI',
        click: () => {
          app.quit();
        },
      },
    ]);

  tray.setContextMenu(buildMenu());

  // ── Clique com botão esquerdo ou duplo clique restaura a janela ──
  tray.on('click', restoreWindow);
  tray.on('double-click', restoreWindow);
}

/** Destrói o ícone da bandeja e libera recursos */
export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
