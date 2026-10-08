import React, { useState, useEffect, useCallback } from 'react';
import { Minus, Square, Copy, X, Settings, AlertCircle } from 'lucide-react';
import { SystemStatus } from '../types/download.js';

interface TitleBarProps {
  systemStatus?: SystemStatus | null;
  onOpenSettings?: () => void;
  sseConnected?: boolean;
}

export const TitleBar: React.FC<TitleBarProps> = ({
  systemStatus,
  onOpenSettings,
  sseConnected = true,
}) => {
  const isElectron = Boolean(typeof window !== 'undefined' && window.electronAPI?.isElectron);
  const [isMaximized, setIsMaximized] = useState(false);

  const toolsOk =
    systemStatus?.tools.ytdlp.available &&
    systemStatus?.tools.ffmpeg.available;

  useEffect(() => {
    if (!isElectron || !window.electronAPI) return;

    window.electronAPI.isWindowMaximized().then((max) => {
      setIsMaximized(Boolean(max));
    });

    const unsubscribe = window.electronAPI.onMaximizeChange((max) => {
      setIsMaximized(max);
    });

    return () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    };
  }, [isElectron]);

  const handleMinimize = useCallback(() => {
    window.electronAPI?.minimizeWindow();
  }, []);

  const handleMaximize = useCallback(() => {
    window.electronAPI?.maximizeWindow();
  }, []);

  const handleClose = useCallback(() => {
    window.electronAPI?.closeWindow();
  }, []);

  return (
    <header
      onDoubleClick={isElectron ? handleMaximize : undefined}
      className="w-full h-11 px-4 sticky top-0 z-50 bg-white/50 backdrop-blur-md border-b border-white/40 flex items-center justify-between select-none app-drag transition-colors"
    >
      {/* ── Identificação da Aplicação (Esquerda - Rente ao Topo) ── */}
      <div className="flex items-center gap-2.5 pointer-events-none">
        <img
          src="/assets/yt-dlp-logo.png"
          alt="yt-dlp logo"
          className="w-5 h-5 rounded-md object-contain shadow-xs border border-white/60"
        />
        <div className="flex items-center gap-1.5">
          <span className="font-bold text-xs sm:text-sm tracking-tight text-slate-900">
            yt-dlp
          </span>
          <span className="text-[10px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded-md liquid-button leading-none">
            GUI
          </span>
          <span className="text-slate-300 hidden sm:inline text-xs">/</span>
          <span className="text-slate-400 font-normal text-[11px] hidden sm:inline">
            Downloader Local
          </span>
        </div>
      </div>

      {/* ── Espaço Central Livre para Arrasto da Janela ── */}
      <div className="flex-1 h-full" />

      {/* ── Ações e Controles (Direita) ── */}
      <div className="flex items-center gap-2 app-no-drag">
        {/* Botão de Configurações — Integrado no Topo */}
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            className="relative w-8 h-8 rounded-full glass-icon-button cursor-pointer flex items-center justify-center text-slate-600 hover:text-slate-900 transition-colors"
            title="Configurações e Diagnóstico"
            aria-label="Abrir Configurações"
          >
            <Settings className="w-4 h-4" strokeWidth={1.5} />
            {/* Indicador de problema nos binários */}
            {systemStatus && !toolsOk && (
              <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-amber-400 rounded-full border-2 border-white flex items-center justify-center">
                <AlertCircle className="w-1.5 h-1.5 text-white" />
              </span>
            )}
            {/* Indicador SSE desconectado */}
            {!sseConnected && (
              <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 bg-amber-400 rounded-full border-2 border-white" />
            )}
          </button>
        )}

        {/* ── Controles de Janela Ampliados (Somente no Electron) ── */}
        {isElectron && (
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-white/50 backdrop-blur-md border border-white/70 shadow-xs">
            {/* Minimizar */}
            <button
              onClick={handleMinimize}
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-white/80 active:scale-95 transition-all cursor-pointer"
              title="Minimizar"
              aria-label="Minimizar janela"
            >
              <Minus className="w-4 h-4" strokeWidth={1.8} />
            </button>

            {/* Maximizar / Restaurar */}
            <button
              onClick={handleMaximize}
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-white/80 active:scale-95 transition-all cursor-pointer"
              title={isMaximized ? 'Restaurar' : 'Maximizar'}
              aria-label={isMaximized ? 'Restaurar janela' : 'Maximizar janela'}
            >
              {isMaximized ? (
                <Copy className="w-3.5 h-3.5" strokeWidth={1.8} />
              ) : (
                <Square className="w-3.5 h-3.5" strokeWidth={1.8} />
              )}
            </button>

            {/* Fechar */}
            <button
              onClick={handleClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-slate-500 hover:text-rose-600 hover:bg-rose-500/15 active:scale-95 transition-all cursor-pointer"
              title="Fechar"
              aria-label="Fechar janela"
            >
              <X className="w-4 h-4" strokeWidth={1.8} />
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
