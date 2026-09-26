import React, { useState, useEffect, useCallback } from 'react';
import { Minus, Square, Copy, X } from 'lucide-react';

export const TitleBar: React.FC = () => {
  const isElectron = Boolean(typeof window !== 'undefined' && window.electronAPI?.isElectron);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    if (!isElectron || !window.electronAPI) return;

    window.electronAPI.isWindowMaximized().then((max) => {
      setIsMaximized(Boolean(max));
    });

    window.electronAPI.onMaximizeChange((max) => {
      setIsMaximized(max);
    });
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

  // Se estiver no navegador web, a barra de título não é renderizada
  if (!isElectron) return null;

  return (
    <div
      onDoubleClick={handleMaximize}
      className="w-full h-9 px-3 flex items-center justify-between app-drag select-none relative z-30 transition-colors"
    >
      {/* ── Identificação da Aplicação (Esquerda) ── */}
      <div className="flex items-center gap-2 pointer-events-none">
        <img
          src="/assets/yt-dlp-logo.png"
          alt="Logo"
          className="w-4 h-4 rounded object-contain shadow-xs border border-white/60"
        />
        <div className="flex items-center gap-1.5 text-xs">
          <span className="font-semibold text-slate-700 tracking-tight">
            yt-dlp GUI
          </span>
          <span className="text-slate-300">/</span>
          <span className="text-slate-400 font-normal text-[11px]">
            Downloader Local
          </span>
        </div>
      </div>

      {/* ── Espaço Central de Arrasto ── */}
      <div className="flex-1 h-full" />

      {/* ── Cápsula de Controles de Janela (Direita) ── */}
      <div className="flex items-center gap-1 px-1 py-0.5 rounded-full bg-white/40 backdrop-blur-md border border-white/60 shadow-xs app-no-drag">
        {/* Minimizar */}
        <button
          onClick={handleMinimize}
          className="w-6 h-6 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-white/80 active:scale-95 transition-all cursor-pointer"
          title="Minimizar"
          aria-label="Minimizar janela"
        >
          <Minus className="w-3.5 h-3.5" strokeWidth={1.8} />
        </button>

        {/* Maximizar / Restaurar */}
        <button
          onClick={handleMaximize}
          className="w-6 h-6 rounded-full flex items-center justify-center text-slate-500 hover:text-slate-900 hover:bg-white/80 active:scale-95 transition-all cursor-pointer"
          title={isMaximized ? 'Restaurar' : 'Maximizar'}
          aria-label={isMaximized ? 'Restaurar janela' : 'Maximizar janela'}
        >
          {isMaximized ? (
            <Copy className="w-3 h-3" strokeWidth={1.8} />
          ) : (
            <Square className="w-3 h-3" strokeWidth={1.8} />
          )}
        </button>

        {/* Fechar */}
        <button
          onClick={handleClose}
          className="w-6 h-6 rounded-full flex items-center justify-center text-slate-500 hover:text-rose-600 hover:bg-rose-500/15 active:scale-95 transition-all cursor-pointer"
          title="Fechar"
          aria-label="Fechar janela"
        >
          <X className="w-3.5 h-3.5" strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
};
