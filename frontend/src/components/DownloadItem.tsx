import React, { useState } from 'react';
import {
  Download,
  CheckCircle2,
  XCircle,
  Clock,
  Terminal,
  Trash2,
  Ban,
  Activity,
  Zap,
  HardDrive,
  FileCheck,
  FolderOpen,
} from 'lucide-react';
import { DownloadJob } from '../types/download.js';
import { LogViewer } from './LogViewer.js';

interface DownloadItemProps {
  job: DownloadJob;
  onCancel: (id: string) => Promise<boolean>;
  onDelete: (id: string) => Promise<boolean>;
}

export const DownloadItem: React.FC<DownloadItemProps> = ({ job, onCancel, onDelete }) => {
  const [showLogs, setShowLogs] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const isActive = job.status === 'downloading' || job.status === 'processing';
  const isQueued = job.status === 'queued';
  const isCompleted = job.status === 'completed';
  const isError = job.status === 'error';
  const isCancelled = job.status === 'cancelled';

  const handleOpenFolder = async () => {
    try {
      const api = (window as any).electronAPI;
      if (api?.openFolder) {
        await api.openFolder(job.options.outputDir);
      } else {
        await fetch('/api/system/open-folder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folderPath: job.options.outputDir }),
        });
      }
    } catch (err) {
      console.error('Erro ao abrir pasta no explorador:', err);
    }
  };

  const handleCancel = async () => {
    setCancelling(true);
    await onCancel(job.id);
    setCancelling(false);
  };

  const getStageLabel = (stage: string) => {
    switch (stage) {
      case 'downloading':
        return 'Baixando stream';
      case 'merging':
        return 'Mesclando faixas (FFmpeg)';
      case 'extracting_audio':
        return 'Extraindo áudio (FFmpeg)';
      case 'processing':
        return 'Pós-processamento';
      case 'completed':
        return 'Concluído';
      case 'cancelled':
        return 'Cancelado';
      case 'error':
        return 'Falhou';
      default:
        return stage || 'Aguardando';
    }
  };

  return (
    <>
      <div className="w-full glass-card rounded-2xl p-5 transition-all duration-200 hover:bg-white/70">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          {/* Informações Principais */}
          <div className="flex items-start gap-3.5 flex-1 min-w-0">
            {job.thumbnail ? (
              <img
                src={job.thumbnail}
                alt={job.title}
                className="w-16 h-12 object-cover rounded-xl border border-white/60 bg-slate-100/50 shrink-0"
              />
            ) : (
              <div className="w-12 h-12 rounded-xl glass-pill flex items-center justify-center text-slate-400 shrink-0">
                <Download className="w-5 h-5 text-slate-500" strokeWidth={1.5} />
              </div>
            )}

            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-slate-800 truncate" title={job.title}>
                {job.title}
              </h3>
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <span className="font-mono text-[11px] font-medium px-2 py-0.5 rounded-md glass-pill text-slate-600">
                  {job.options.mode === 'video'
                    ? `Vídeo (${job.options.videoResolution} • ${job.options.videoContainer?.toUpperCase()})`
                    : `Áudio (${job.options.audioFormat?.toUpperCase()} • ${job.options.audioQuality})`}
                </span>

                <span
                  className={`text-[11px] font-medium px-2 py-0.5 rounded-md flex items-center gap-1 ${
                    isActive
                      ? 'glass-pill !bg-blue-50/50 text-blue-600'
                      : isCompleted
                      ? 'glass-pill !bg-emerald-50/50 text-emerald-600'
                      : isError
                      ? 'glass-pill !bg-rose-50/50 text-rose-600'
                      : isCancelled
                      ? 'glass-pill text-slate-500'
                      : 'glass-pill !bg-amber-50/50 text-amber-600'
                  }`}
                >
                  {isActive && <Activity className="w-3 h-3 animate-spin text-blue-500" strokeWidth={1.5} />}
                  {isCompleted && <CheckCircle2 className="w-3 h-3 text-emerald-500" strokeWidth={1.5} />}
                  {isError && <XCircle className="w-3 h-3 text-rose-500" strokeWidth={1.5} />}
                  {isCancelled && <Ban className="w-3 h-3 text-slate-400" strokeWidth={1.5} />}
                  {isQueued && <Clock className="w-3 h-3 text-amber-500" strokeWidth={1.5} />}
                  <span>{getStageLabel(job.progress.stage || job.status)}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Botões de Ação — Cápsulas de vidro */}
          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
            <button
              type="button"
              onClick={() => setShowLogs(true)}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 glass-button font-medium cursor-pointer"
              title="Ver logs do yt-dlp"
            >
              <Terminal className="w-3.5 h-3.5" strokeWidth={1.5} />
              <span>Logs</span>
            </button>

            {(isActive || isQueued) && (
              <button
                type="button"
                onClick={handleCancel}
                disabled={cancelling}
                className="flex items-center gap-1 text-xs px-3 py-1.5 glass-button-danger font-medium cursor-pointer"
              >
                <Ban className="w-3.5 h-3.5" strokeWidth={1.5} />
                <span>Cancelar</span>
              </button>
            )}

            {isCompleted && (
              <button
                type="button"
                onClick={handleOpenFolder}
                className="flex items-center gap-1 text-xs px-2.5 py-1.5 glass-button font-medium cursor-pointer"
                title="Abrir pasta de download no Explorador de Arquivos"
              >
                <FolderOpen className="w-3.5 h-3.5 text-blue-500" strokeWidth={1.5} />
                <span className="hidden sm:inline">Pasta</span>
              </button>
            )}

            {(isCompleted || isError || isCancelled) && (
              <button
                type="button"
                onClick={() => onDelete(job.id)}
                className="p-1.5 glass-icon-button-danger cursor-pointer"
                title="Remover da lista"
              >
                <Trash2 className="w-4 h-4" strokeWidth={1.5} />
              </button>
            )}
          </div>
        </div>

        {/* Barra de Progresso — Shimmer Vítreo */}
        <div className="mt-4">
          <div className="flex justify-between items-center text-xs font-semibold text-slate-700 mb-1.5">
            <span className="flex items-center gap-1.5">
              <span className="font-mono text-blue-500">{job.progress.percent.toFixed(1)}%</span>
              <span className="text-slate-300 font-normal">|</span>
              <span className="text-slate-500 font-normal text-[11px]">{getStageLabel(job.progress.stage)}</span>
            </span>
            <span className="text-slate-500 font-mono text-[11px]">{job.progress.eta !== '--:--' ? `ETA: ${job.progress.eta}` : ''}</span>
          </div>

          <div className="w-full bg-white/40 h-2 rounded-full overflow-hidden border border-white/50">
            <div
              className={`h-full transition-all duration-300 rounded-full ${
                isCompleted
                  ? 'bg-emerald-500'
                  : isError
                  ? 'bg-rose-500'
                  : isCancelled
                  ? 'bg-slate-300'
                  : isActive
                  ? 'progress-shimmer'
                  : 'bg-blue-500'
              }`}
              style={{ width: `${Math.min(100, Math.max(0, job.progress.percent))}%` }}
            />
          </div>
        </div>

        {/* Métricas em Tempo Real — Tipografia Mono */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 pt-3 border-t border-white/40 text-xs text-slate-600">
          <div className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-amber-500" strokeWidth={1.5} />
            <span className="text-slate-600 font-medium text-[11px]">Velocidade:</span>
            <span className="font-bold text-slate-800 font-mono text-[11px]">{job.progress.speed || '--'}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <HardDrive className="w-3.5 h-3.5 text-indigo-500" strokeWidth={1.5} />
            <span className="text-slate-600 font-medium text-[11px]">Tamanho:</span>
            <span className="font-bold text-slate-800 font-mono text-[11px] truncate">{job.progress.totalBytes || '--'}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <FileCheck className="w-3.5 h-3.5 text-emerald-600" strokeWidth={1.5} />
            <span className="text-slate-600 font-medium text-[11px]">Baixado:</span>
            <span className="font-bold text-slate-800 font-mono text-[11px] truncate">{job.progress.downloadedBytes || '0 B'}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-blue-500" strokeWidth={1.5} />
            <span className="text-slate-600 font-medium text-[11px]">Restante:</span>
            <span className="font-bold text-slate-800 font-mono text-[11px]">{job.progress.eta || '--'}</span>
          </div>
        </div>

        {/* Mensagem de Erro */}
        {job.error && (
          <div className="mt-3 p-2.5 rounded-xl glass-pill !bg-rose-50/50 !border-rose-200/40 text-rose-600 text-xs flex items-start gap-2">
            <XCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" strokeWidth={1.5} />
            <span className="break-all font-mono text-[11px]">{job.error}</span>
          </div>
        )}
      </div>

      {/* Modal de Logs */}
      <LogViewer
        logs={job.logs}
        title={`Logs: ${job.title}`}
        isOpen={showLogs}
        onClose={() => setShowLogs(false)}
      />
    </>
  );
};
