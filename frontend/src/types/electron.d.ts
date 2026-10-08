/**
 * Declarações de tipos para a ponte IPC do Electron (window.electronAPI).
 */

export interface ElectronAPI {
  isElectron: true;
  getAppVersion: () => Promise<string>;
  showNotification: (title: string, body: string) => Promise<void>;
  selectFolder: (defaultPath?: string) => Promise<{ path: string | null; cancelled: boolean }>;
  openFolder: (folderPath: string) => Promise<{ success: boolean; error?: string }>;
  minimizeWindow: () => Promise<void>;
  maximizeWindow: () => Promise<void>;
  closeWindow: () => Promise<void>;
  isWindowMaximized: () => Promise<boolean>;
  onMaximizeChange: (callback: (isMaximized: boolean) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}
