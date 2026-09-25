/**
 * Electron Preload Script — Bridge segura entre renderer e main process.
 *
 * Expõe apenas APIs mínimas e necessárias via contextBridge,
 * mantendo contextIsolation:true e nodeIntegration:false.
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
});
