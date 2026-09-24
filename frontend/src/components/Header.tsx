import React from 'react';
import { DownloadCloud, Settings, CheckCircle2, AlertCircle } from 'lucide-react';
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
    <header className="w-full border-b border-slate-100 bg-white/80 backdrop-blur sticky top-0 z-20">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        {/* Logo & Marca */}
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-sm shadow-blue-200">
            <DownloadCloud className="w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-base tracking-tight text-slate-900 leading-none">
              yt-dlp <span className="text-blue-600 font-semibold text-xs ml-0.5 px-1.5 py-0.5 bg-blue-50 rounded-full">GUI</span>
            </span>
            <span className="text-[11px] text-slate-400 mt-0.5">Downloader Local + FFmpeg</span>
          </div>
        </div>

        {/* Ações & Status da Máquina */}
        <div className="flex items-center gap-3">
          {/* Status SSE */}
          <div
            className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border border-slate-100 bg-slate-50 text-slate-500"
            title={sseConnected ? 'Conexão em tempo real ativa' : 'Reconectando ao servidor...'}
          >
            <span
              className={`w-2 h-2 rounded-full ${
                sseConnected ? 'bg-emerald-500 ring-2 ring-emerald-100 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span className="text-[11px] font-medium hidden sm:inline">
              {sseConnected ? 'Live' : 'Offline'}
            </span>
          </div>

          {/* Status dos Binários */}
          <button
            onClick={onOpenSettings}
            className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 transition text-slate-700 font-medium"
            title="Verificar ferramentas instaladas e configurações"
          >
            {toolsOk ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                <span className="hidden sm:inline">Ferramentas Prontas</span>
              </>
            ) : (
              <>
                <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                <span className="hidden sm:inline">Verificar Ferramentas</span>
              </>
            )}
            <Settings className="w-3.5 h-3.5 text-slate-400 ml-0.5" />
          </button>
        </div>
      </div>
    </header>
  );
};
