/**
 * Electron Preload Script — Bridge segura entre renderer e main process.
 *
 * Usa CommonJS (.cts -> .cjs) para compatibilidade nativa com o Electron
 * em todos os modos (sandboxed, contextIsolation, packaged e dev).
 */

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  /** Flag para o frontend detectar que está rodando no Electron */
  isElectron: true as const,

  /** Retorna a versão do app definida no package.json */
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('get-app-version'),

  /** Dispara uma notificação nativa do Windows */
  showNotification: (title: string, body: string): Promise<void> =>
    ipcRenderer.invoke('show-notification', title, body),

  /** Abre o diálogo nativo do Electron para selecionar uma pasta */
  selectFolder: (defaultPath?: string): Promise<{ path: string | null; cancelled: boolean }> =>
    ipcRenderer.invoke('select-folder', defaultPath),

  /** Abre a pasta no explorador nativo do sistema operacional */
  openFolder: (folderPath: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('open-folder', folderPath),

  /** Minimiza a janela */
  minimizeWindow: (): Promise<void> => ipcRenderer.invoke('window-minimize'),

  /** Alterna entre maximizar e restaurar a janela */
  maximizeWindow: (): Promise<void> => ipcRenderer.invoke('window-maximize'),

  /** Fecha a janela (ou minimiza para a bandeja se configurado) */
  closeWindow: (): Promise<void> => ipcRenderer.invoke('window-close'),

  /** Retorna se a janela está maximizada */
  isWindowMaximized: (): Promise<boolean> => ipcRenderer.invoke('window-is-maximized'),

  /** Registra listener para alterações de estado de maximização da janela */
  onMaximizeChange: (callback: (isMaximized: boolean) => void): void => {
    ipcRenderer.on('window-maximized-change', (_event, isMax) => callback(isMax));
  },
});
