import React from 'react';
import { Settings, AlertCircle } from 'lucide-react';
import { SystemStatus } from '../types/download.js';

interface HeaderProps {
  systemStatus: SystemStatus | null;
  onOpenSettings: () => void;
  sseConnected: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  systemStatus,
  onOpenSettings,
  sseConnected,
}) => {
  const toolsOk =
    systemStatus?.tools.ytdlp.available &&
    systemStatus?.tools.ffmpeg.available;

  return (
    <header className="w-full sticky top-0 z-20 px-4 sm:px-6 pt-4">
      <div className="max-w-7xl mx-auto glass-card rounded-2xl px-5 h-14 flex items-center justify-between">
        {/* Espaçador esquerdo para centralizar a marca */}
        <div className="w-10" />

        {/* Logo & Marca – Centralizada */}
        <div className="flex items-center gap-2.5">
          <img
            src="/assets/yt-dlp-logo.png"
            alt="yt-dlp logo"
            className="w-8 h-8 rounded-xl object-contain shadow-sm border border-white/60"
          />
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-sm tracking-tight text-slate-900">
              yt-dlp
            </span>
            <span className="text-[10px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded-md liquid-button leading-none">
              GUI
            </span>
          </div>
        </div>

        {/* Botão de Configurações – Cápsula de vidro */}
        <button
          onClick={onOpenSettings}
          className="relative w-10 h-10 rounded-xl glass-pill flex items-center justify-center text-slate-500 hover:text-slate-700 transition-all cursor-pointer"
          title="Configurações"
        >
          <Settings className="w-[18px] h-[18px]" strokeWidth={1.5} />
          {/* Indicador de problema nos binários */}
          {systemStatus && !toolsOk && (
            <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-amber-400 rounded-full border-2 border-white flex items-center justify-center">
              <AlertCircle className="w-2 h-2 text-white" />
            </span>
          )}
          {/* Indicador SSE desconectado */}
          {!sseConnected && (
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-amber-400 rounded-full border-2 border-white" />
          )}
        </button>
      </div>
    </header>
  );
};
