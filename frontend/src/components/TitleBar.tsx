import { useCallback, useEffect, useState } from 'react';
import { Minus, Square, Copy, X, Settings } from 'lucide-react';
import type { SystemStatus } from '@ytdlp/shared';
import { Button } from './ui.js';

export function TitleBar({ systemStatus, onOpenSettings, sseConnected = true }: {
  systemStatus?: SystemStatus | null; onOpenSettings?: () => void; sseConnected?: boolean;
}) {
  const isElectron = Boolean(window.electronAPI?.isElectron);
  const [maximized, setMaximized] = useState(false);
  const toolsOk = systemStatus?.tools.ytdlp.available && systemStatus?.tools.ffmpeg.available;
  useEffect(() => {
    const api = window.electronAPI;
    if (!isElectron || !api) return;
    void api.isWindowMaximized().then(value => setMaximized(Boolean(value)));
    return api.onMaximizeChange(value => setMaximized(value));
  }, [isElectron]);
  const maximize = useCallback(() => { window.electronAPI?.maximizeWindow(); }, []);
  return <header className="ui-topbar app-drag" onDoubleClick={isElectron ? maximize : undefined}>
    <div className="ui-brand"><img src="/assets/yt-dlp-logo.png" alt="" /><span>yt-dlp GUI</span></div>
    <div className="ui-topbar-space" />
    {onOpenSettings && <Button iconOnly className="app-no-drag" onClick={onOpenSettings} onDoubleClick={event => event.stopPropagation()}
      aria-label="Abrir configurações" title={systemStatus && !toolsOk ? 'Configurações — ferramenta indisponível' : 'Configurações'}><Settings /></Button>}
    {!sseConnected && <span className="ui-connection" role="status">Reconectando</span>}
    {isElectron && <div className="ui-window-controls app-no-drag" onDoubleClick={event => event.stopPropagation()}>
      <Button iconOnly aria-label="Minimizar janela" onClick={() => window.electronAPI?.minimizeWindow()}><Minus /></Button>
      <Button iconOnly aria-label={maximized ? 'Restaurar janela' : 'Maximizar janela'} onClick={maximize}>{maximized ? <Copy /> : <Square />}</Button>
      <Button iconOnly variant="danger" aria-label="Fechar janela" onClick={() => window.electronAPI?.closeWindow()}><X /></Button>
    </div>}
  </header>;
}
