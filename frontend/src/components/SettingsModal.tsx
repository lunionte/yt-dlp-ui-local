import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, AlertCircle, Save, RotateCw, FolderOpen, ExternalLink, Loader2, Sparkles } from 'lucide-react';
import { SystemStatus } from '../types/download.js';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  systemStatus: SystemStatus | null;
  onRefreshStatus: () => Promise<void>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  systemStatus,
  onRefreshStatus,
}) => {
  const [defaultDownloadDir, setDefaultDownloadDir] = useState('');
  const [maxConcurrentDownloads, setMaxConcurrentDownloads] = useState(2);
  const [saving, setSaving] = useState(false);
  const [isBrowsingFolder, setIsBrowsingFolder] = useState(false);
  const [folderSelected, setFolderSelected] = useState(false);
  const [openingFolder, setOpeningFolder] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const folderSelectedTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (folderSelectedTimeoutRef.current) {
        clearTimeout(folderSelectedTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (systemStatus) {
      setDefaultDownloadDir(systemStatus.config.defaultDownloadDir || '');
      setMaxConcurrentDownloads(systemStatus.config.maxConcurrentDownloads || 2);
    }
  }, [systemStatus]);

  if (!isOpen) return null;

  const handleBrowseFolder = async () => {
    setIsBrowsingFolder(true);
    try {
      const res = await fetch('/api/system/browse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'folder',
          title: 'Selecione a pasta padrão de downloads',
          defaultPath: defaultDownloadDir,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.path) {
          setDefaultDownloadDir(data.path);
          setFolderSelected(true);
          if (folderSelectedTimeoutRef.current) {
            clearTimeout(folderSelectedTimeoutRef.current);
          }
          folderSelectedTimeoutRef.current = setTimeout(() => {
            setFolderSelected(false);
          }, 2000);
        }
      }
    } catch (err) {
      console.error('Erro ao abrir diálogo nativo:', err);
    } finally {
      setIsBrowsingFolder(false);
    }
  };

  const handleOpenFolder = async (folderPath: string) => {
    if (!folderPath) return;
    setOpeningFolder(true);
    try {
      await fetch('/api/system/open-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderPath }),
      });
    } catch (err) {
      console.error('Erro ao abrir pasta no explorador:', err);
    } finally {
      setOpeningFolder(false);
    }
  };

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefreshStatus();
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch('/api/system/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          defaultDownloadDir: defaultDownloadDir.trim() || undefined,
          maxConcurrentDownloads,
        }),
      });

      if (res.ok) {
        setMessage({ text: 'Configurações salvas com sucesso!', type: 'success' });
        await onRefreshStatus();
      } else {
        const data = await res.json();
        setMessage({ text: data.error || 'Erro ao salvar', type: 'error' });
      }
    } catch (err: any) {
      setMessage({ text: err.message || 'Erro de rede ao salvar', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col">
        {/* Cabeçalho */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">
              Configurações
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Ferramentas embutidas e preferências de download
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-xl hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSave} className="p-6 space-y-6 overflow-y-auto max-h-[75vh]">
          {/* Card de Diagnóstico das Ferramentas Embutidas */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Ferramentas Integradas
                </span>
              </div>
              <button
                type="button"
                onClick={handleManualRefresh}
                disabled={isRefreshing}
                className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium cursor-pointer disabled:opacity-50"
              >
                <RotateCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                Atualizar
              </button>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              O <strong>yt-dlp</strong>, <strong>FFmpeg</strong> e <strong>FFprobe</strong> já vêm embutidos nativamente nesta aplicação. Não é necessário instalar ou configurar caminhos na sua máquina.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              {/* yt-dlp */}
              <div className="bg-white p-3 rounded-xl border border-slate-200 flex flex-col justify-between gap-1 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800">yt-dlp</span>
                  {systemStatus?.tools.ytdlp.available ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-600 border border-emerald-100">
                      <CheckCircle2 className="w-3 h-3" />
                      Embutido
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-600 border border-rose-100">
                      <AlertCircle className="w-3 h-3" />
                      Erro
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 truncate" title={systemStatus?.tools.ytdlp.version}>
                  {systemStatus?.tools.ytdlp.available
                    ? `v${systemStatus.tools.ytdlp.version}`
                    : 'Falha ao iniciar'}
                </div>
              </div>

              {/* FFmpeg */}
              <div className="bg-white p-3 rounded-xl border border-slate-200 flex flex-col justify-between gap-1 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800">FFmpeg</span>
                  {systemStatus?.tools.ffmpeg.available ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-600 border border-emerald-100">
                      <CheckCircle2 className="w-3 h-3" />
                      Embutido
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-600 border border-rose-100">
                      <AlertCircle className="w-3 h-3" />
                      Erro
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 truncate">
                  {systemStatus?.tools.ffmpeg.available
                    ? 'Motor de Mídia Ativo'
                    : 'Falha ao iniciar'}
                </div>
              </div>

              {/* FFprobe */}
              <div className="bg-white p-3 rounded-xl border border-slate-200 flex flex-col justify-between gap-1 shadow-2xs">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-800">FFprobe</span>
                  {systemStatus?.tools.ffprobe.available ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-600 border border-emerald-100">
                      <CheckCircle2 className="w-3 h-3" />
                      Embutido
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-50 text-rose-600 border border-rose-100">
                      <AlertCircle className="w-3 h-3" />
                      Erro
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 truncate">
                  {systemStatus?.tools.ffprobe.available
                    ? 'Inspetor Ativo'
                    : 'Falha ao iniciar'}
                </div>
              </div>
            </div>
          </div>

          {/* Preferências de Download */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Pasta Padrão de Download
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={defaultDownloadDir}
                  onChange={(e) => setDefaultDownloadDir(e.target.value)}
                  placeholder="Ex: C:\Users\nome\Downloads"
                  className="flex-1 min-w-0 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={handleBrowseFolder}
                  disabled={isBrowsingFolder}
                  title="Selecionar pasta no computador"
                  className={`flex items-center gap-1.5 px-3.5 py-2.5 border rounded-xl text-xs font-semibold transition cursor-pointer shrink-0 disabled:opacity-75 ${
                    folderSelected
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border-slate-200'
                  }`}
                >
                  {folderSelected ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 animate-in fade-in zoom-in-75 duration-200" />
                  ) : (
                    <FolderOpen className="w-4 h-4 text-blue-600" />
                  )}
                  <span className="hidden sm:inline">
                    {folderSelected ? 'Selecionada' : 'Procurar'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenFolder(defaultDownloadDir)}
                  disabled={!defaultDownloadDir || openingFolder}
                  title="Abrir pasta no Explorador de Arquivos do Windows"
                  className="flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border border-slate-200 rounded-xl text-xs font-semibold transition cursor-pointer shrink-0 disabled:opacity-50"
                >
                  {openingFolder ? (
                    <Loader2 className="w-4 h-4 animate-spin text-slate-600" />
                  ) : (
                    <ExternalLink className="w-4 h-4 text-slate-600" />
                  )}
                  <span className="hidden sm:inline">Abrir</span>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Limite de Downloads Concorrentes
              </label>
              <select
                value={maxConcurrentDownloads}
                onChange={(e) => setMaxConcurrentDownloads(parseInt(e.target.value, 10))}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                <option value={1}>1 processo por vez (Recomendado para conexões modestas)</option>
                <option value={2}>2 processos concorrentes (Equilíbrio ideal)</option>
                <option value={3}>3 processos concorrentes</option>
                <option value={5}>5 processos concorrentes (Conexões ultrarrápidas)</option>
              </select>
            </div>
          </div>

          {message && (
            <div
              className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                message.type === 'success'
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                  : 'bg-rose-50 text-rose-700 border border-rose-100'
              }`}
            >
              {message.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{message.text}</span>
            </div>
          )}

          {/* Ações */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs sm:text-sm font-semibold text-slate-600 hover:text-slate-800 transition cursor-pointer"
            >
              Fechar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs sm:text-sm rounded-xl transition shadow-xs cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Salvando...' : 'Salvar Alterações'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
