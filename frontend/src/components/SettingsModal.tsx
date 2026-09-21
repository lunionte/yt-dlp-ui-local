import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, AlertCircle, Save, RotateCw, FolderOpen, ExternalLink, Loader2 } from 'lucide-react';
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
  const [ytdlpPath, setYtdlpPath] = useState('');
  const [ffmpegPath, setFfmpegPath] = useState('');
  const [ffprobePath, setFfprobePath] = useState('');
  const [defaultDownloadDir, setDefaultDownloadDir] = useState('');
  const [maxConcurrentDownloads, setMaxConcurrentDownloads] = useState(2);
  const [saving, setSaving] = useState(false);
  const [browsingField, setBrowsingField] = useState<'ytdlp' | 'ffmpeg' | 'downloadDir' | null>(null);
  const [openingFolder, setOpeningFolder] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (systemStatus) {
      setYtdlpPath(systemStatus.config.ytdlpPath || '');
      setFfmpegPath(systemStatus.config.ffmpegPath || '');
      setFfprobePath(systemStatus.config.ffprobePath || '');
      setDefaultDownloadDir(systemStatus.config.defaultDownloadDir || '');
      setMaxConcurrentDownloads(systemStatus.config.maxConcurrentDownloads || 2);
    }
  }, [systemStatus]);

  if (!isOpen) return null;

  const handleBrowse = async (type: 'file' | 'folder', field: 'ytdlp' | 'ffmpeg' | 'downloadDir') => {
    setBrowsingField(field);
    try {
      let title = 'Selecione a pasta';
      let defaultPath = '';
      let filter: string | undefined = undefined;

      if (field === 'ytdlp') {
        title = 'Selecione o executável yt-dlp';
        defaultPath = ytdlpPath;
        filter = 'Executáveis (*.exe)|*.exe|Todos os arquivos (*.*)|*.*';
      } else if (field === 'ffmpeg') {
        title = 'Selecione o executável FFmpeg';
        defaultPath = ffmpegPath;
        filter = 'Executáveis (*.exe)|*.exe|Todos os arquivos (*.*)|*.*';
      } else {
        title = 'Selecione a pasta padrão de downloads';
        defaultPath = defaultDownloadDir;
      }

      const res = await fetch('/api/system/browse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, title, defaultPath, filter }),
      });

      if (res.ok) {
        const data = await res.json();
        if (data.path) {
          if (field === 'ytdlp') setYtdlpPath(data.path);
          if (field === 'ffmpeg') setFfmpegPath(data.path);
          if (field === 'downloadDir') setDefaultDownloadDir(data.path);
        }
      }
    } catch (err) {
      console.error('Erro ao abrir diálogo nativo:', err);
    } finally {
      setBrowsingField(null);
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch('/api/system/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ytdlpPath: ytdlpPath.trim() || undefined,
          ffmpegPath: ffmpegPath.trim() || undefined,
          ffprobePath: ffprobePath.trim() || undefined,
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
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col">
        {/* Cabeçalho */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">
              Configurações do Sistema
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Status das ferramentas locais e diretórios de download
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
          {/* Card de Diagnóstico das Ferramentas */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Diagnóstico dos Executáveis
              </span>
              <button
                type="button"
                onClick={onRefreshStatus}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium cursor-pointer"
              >
                <RotateCw className="w-3.5 h-3.5" />
                Atualizar
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {/* yt-dlp */}
              <div className="bg-white p-3 rounded-xl border border-slate-200 flex items-start gap-2.5">
                {systemStatus?.tools.ytdlp.available ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                )}
                <div className="min-w-0">
                  <div className="font-semibold text-slate-800">yt-dlp</div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {systemStatus?.tools.ytdlp.available
                      ? `Versão: ${systemStatus.tools.ytdlp.version}`
                      : 'Não encontrado'}
                  </div>
                </div>
              </div>

              {/* ffmpeg */}
              <div className="bg-white p-3 rounded-xl border border-slate-200 flex items-start gap-2.5">
                {systemStatus?.tools.ffmpeg.available ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                )}
                <div className="min-w-0">
                  <div className="font-semibold text-slate-800">FFmpeg</div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {systemStatus?.tools.ffmpeg.available
                      ? `Versão detectada`
                      : 'Não encontrado'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Campos de Caminhos */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Caminho do executável yt-dlp
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={ytdlpPath}
                  onChange={(e) => setYtdlpPath(e.target.value)}
                  placeholder="Ex: C:\yt-dlp.exe ou apenas yt-dlp se no PATH"
                  className="flex-1 min-w-0 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={() => handleBrowse('file', 'ytdlp')}
                  disabled={browsingField !== null}
                  title="Procurar executável yt-dlp no computador"
                  className="flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border border-slate-200 rounded-xl text-xs font-semibold transition cursor-pointer shrink-0 disabled:opacity-50"
                >
                  {browsingField === 'ytdlp' ? (
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                  ) : (
                    <FolderOpen className="w-4 h-4 text-blue-600" />
                  )}
                  <span className="hidden sm:inline">Procurar</span>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Caminho do executável FFmpeg
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={ffmpegPath}
                  onChange={(e) => setFfmpegPath(e.target.value)}
                  placeholder="Ex: C:\ffmpeg\bin\ffmpeg.exe"
                  className="flex-1 min-w-0 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                />
                <button
                  type="button"
                  onClick={() => handleBrowse('file', 'ffmpeg')}
                  disabled={browsingField !== null}
                  title="Procurar executável FFmpeg no computador"
                  className="flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border border-slate-200 rounded-xl text-xs font-semibold transition cursor-pointer shrink-0 disabled:opacity-50"
                >
                  {browsingField === 'ffmpeg' ? (
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                  ) : (
                    <FolderOpen className="w-4 h-4 text-blue-600" />
                  )}
                  <span className="hidden sm:inline">Procurar</span>
                </button>
              </div>
            </div>

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
                  onClick={() => handleBrowse('folder', 'downloadDir')}
                  disabled={browsingField !== null}
                  title="Selecionar pasta no computador"
                  className="flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 border border-slate-200 rounded-xl text-xs font-semibold transition cursor-pointer shrink-0 disabled:opacity-50"
                >
                  {browsingField === 'downloadDir' ? (
                    <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                  ) : (
                    <FolderOpen className="w-4 h-4 text-blue-600" />
                  )}
                  <span className="hidden sm:inline">Procurar</span>
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
              Cancelar
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
