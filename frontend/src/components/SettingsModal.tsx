import { openDownloadFolder, selectDownloadFolder } from '../utils/system.js';
import React, { useState, useEffect } from 'react';
import { X, CheckCircle2, AlertCircle, Save, RotateCw, FolderOpen, ExternalLink, Loader2, Sparkles } from 'lucide-react';
import { SystemStatus } from '../types/download.js';
import { AuthContextSchema, BrowserSchema, DialogResultSchema, SystemStatusSchema, type AuthContext } from '@ytdlp/shared';
import { z } from 'zod';
import { apiRequest, errorMessage } from '../utils/api.js';

interface SettingsModalProps {
  isOpen: boolean;
  auth: AuthContext;
  onChangeAuth: (auth: AuthContext) => void;
  onClose: () => void;
  systemStatus: SystemStatus | null;
  onRefreshStatus: () => Promise<void>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  auth,
  onChangeAuth,
  onClose,
  systemStatus,
  onRefreshStatus,
}) => {
  const [defaultDownloadDir, setDefaultDownloadDir] = useState('');
  const [maxConcurrentDownloads, setMaxConcurrentDownloads] = useState(2);
  const [saving, setSaving] = useState(false);
  const [authMode, setAuthMode] = useState<AuthContext['mode']>('none');
  const [browser, setBrowser] = useState('edge');
  const [cookiesFile, setCookiesFile] = useState('');
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
    if (!isOpen) return;
    setMessage(null);
    setAuthMode(auth.mode);
    if (auth.mode === 'browser') setBrowser(auth.browser);
    if (auth.mode === 'file') setCookiesFile(auth.cookiesFile);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, auth]);

  useEffect(() => {
    if (systemStatus && isOpen) {
      setDefaultDownloadDir(systemStatus.config.defaultDownloadDir || '');
      setMaxConcurrentDownloads(systemStatus.config.maxConcurrentDownloads || 2);
    }
  }, [systemStatus, isOpen]);

  if (!isOpen) return null;

  const handleBrowseFolder = async () => {
    setIsBrowsingFolder(true);
    try {
      const selectedPath = await selectDownloadFolder(defaultDownloadDir);

      if (selectedPath) {
        setDefaultDownloadDir(selectedPath);
        setFolderSelected(true);
        if (folderSelectedTimeoutRef.current) {
          clearTimeout(folderSelectedTimeoutRef.current);
        }
        folderSelectedTimeoutRef.current = setTimeout(() => {
          setFolderSelected(false);
        }, 2000);
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
      await openDownloadFolder(folderPath);
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
      const parsedAuth = AuthContextSchema.safeParse(authMode === 'browser' ? { mode: authMode, browser } : authMode === 'file' ? { mode: authMode, cookiesFile } : { mode: authMode });
      if (!parsedAuth.success) throw new Error('Selecione um navegador ou informe o caminho absoluto do arquivo de cookies.');
      await apiRequest('/api/system/config', z.object({ success: z.literal(true), config: SystemStatusSchema.shape.config }), {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultDownloadDir: defaultDownloadDir.trim() || undefined, maxConcurrentDownloads }),
      });
      onChangeAuth(parsedAuth.data);
      setMessage({ text: 'Configurações salvas; autenticação aplicada nesta sessão.', type: 'success' });
      await onRefreshStatus();
    } catch (err: unknown) {
      setMessage({ text: errorMessage(err) || 'Erro de rede ao salvar', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/20 backdrop-blur-md flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="glass-card-strong rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl flex flex-col">
        {/* Cabeçalho */}
        <div className="px-6 py-5 border-b border-white/30 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-800 tracking-tight">
              Configurações
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Ferramentas, autenticação e preferências de download
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 glass-icon-button cursor-pointer"
          >
            <X className="w-5 h-5" strokeWidth={1.5} />
          </button>
        </div>

        {/* Formulário */}
        <form onSubmit={handleSave} className="p-6 space-y-6 overflow-y-auto max-h-[75vh]">
          {/* Card de Diagnóstico das Ferramentas Embutidas */}
          <div className="glass-pill rounded-2xl p-4 space-y-3.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-500" strokeWidth={1.5} />
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                  Ferramentas Integradas
                </span>
              </div>
              <button
                type="button"
                onClick={handleManualRefresh}
                disabled={isRefreshing}
                className="flex items-center gap-1.5 px-2.5 py-1.5 glass-button text-xs font-medium cursor-pointer"
              >
                <RotateCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} strokeWidth={1.5} />
                Atualizar
              </button>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">
              O <strong>yt-dlp</strong> e o <strong>FFmpeg</strong> são necessários. O <strong>FFprobe</strong> é opcional. A origem detectada de cada ferramenta aparece abaixo.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              {/* yt-dlp */}
              <div className="glass-card rounded-xl p-3 flex flex-col justify-between gap-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-700 font-mono text-[11px]">yt-dlp</span>
                  {systemStatus?.tools.ytdlp.available ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold glass-pill !bg-emerald-50/50 text-emerald-600 !border-emerald-200/50">
                      <CheckCircle2 className="w-3 h-3" strokeWidth={1.5} />
                      OK
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold glass-pill !bg-rose-50/50 text-rose-600 !border-rose-200/50">
                      <AlertCircle className="w-3 h-3" strokeWidth={1.5} />
                      Erro
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500 font-mono truncate" title={systemStatus?.tools.ytdlp.version}>
                  {systemStatus?.tools.ytdlp.available
                    ? `v${systemStatus.tools.ytdlp.version} • ${systemStatus.tools.ytdlp.source}`
                    : 'Falha ao iniciar'}
                </div>
              </div>

              {/* FFmpeg */}
              <div className="glass-card rounded-xl p-3 flex flex-col justify-between gap-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-700 font-mono text-[11px]">FFmpeg</span>
                  {systemStatus?.tools.ffmpeg.available ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold glass-pill !bg-emerald-50/50 text-emerald-600 !border-emerald-200/50">
                      <CheckCircle2 className="w-3 h-3" strokeWidth={1.5} />
                      OK
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold glass-pill !bg-rose-50/50 text-rose-600 !border-rose-200/50">
                      <AlertCircle className="w-3 h-3" strokeWidth={1.5} />
                      Erro
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-600 font-medium leading-tight">
                  {systemStatus?.tools.ffmpeg.available
                    ? `Ativo • ${systemStatus.tools.ffmpeg.source}`
                    : 'Falha ao iniciar'}
                </div>
              </div>

              {/* FFprobe */}
              <div className="glass-card rounded-xl p-3 flex flex-col justify-between gap-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-700 font-mono text-[11px]">FFprobe</span>
                  {systemStatus?.tools.ffprobe.available ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold glass-pill !bg-emerald-50/50 text-emerald-600 !border-emerald-200/50">
                      <CheckCircle2 className="w-3 h-3" strokeWidth={1.5} />
                      {systemStatus.tools.ffprobe.embedded ? 'OK' : 'PATH'}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold glass-pill text-slate-500">
                      Opcional
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-600 font-medium leading-tight">
                  {systemStatus?.tools.ffprobe.available
                    ? (systemStatus.tools.ffprobe.embedded ? 'Inspetor Ativo' : 'Encontrado no PATH')
                    : 'Não incluído no Desktop'}
                </div>
              </div>
            </div>
          </div>

          <fieldset className="glass-pill rounded-2xl p-4 space-y-3">
            <legend className="text-xs font-bold text-slate-800">Autenticação no site de origem</legend>
            <p className="text-xs text-slate-500">Só é usada quando você escolhe uma opção. Vale para prévia e download nesta sessão e não é salva em disco. Uma sessão válida não garante acesso a todo conteúdo.</p>
            <select className="glass-select w-full p-2 rounded-xl text-sm" value={authMode} onChange={e => setAuthMode(e.target.value as AuthContext['mode'])}>
              <option value="none">Sem autenticação</option><option value="browser">Usar sessão do navegador</option><option value="file">Usar arquivo de cookies</option>
            </select>
            {authMode === 'browser' && <><select className="glass-select w-full p-2 rounded-xl text-sm" value={browser} onChange={e => setBrowser(e.target.value)}>{BrowserSchema.options.map(value => <option key={value} value={value}>{value}</option>)}</select><p className="text-xs text-slate-500">Faça login no site nesse navegador. O sistema pode impedir a leitura dos cookies; nesse caso use um arquivo Netscape exportado por você.</p></>}
            {authMode === 'file' && <div className="flex gap-2"><input aria-label="Arquivo de cookies" className="glass-input min-w-0 flex-1 rounded-xl p-2 text-xs" value={cookiesFile} onChange={e => setCookiesFile(e.target.value)} placeholder="Caminho absoluto de cookies.txt (formato Netscape)" /><button type="button" className="glass-button px-3" onClick={async () => { try { const result = await apiRequest('/api/system/browse', DialogResultSchema, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'file', title: 'Selecione seu arquivo de cookies', filter: 'Cookies (*.txt)|*.txt' }) }); if (result.path) setCookiesFile(result.path); } catch (error) { setMessage({ text: errorMessage(error), type: 'error' }); } }}>Procurar</button></div>}
          </fieldset>
          {/* Preferências de Download */}
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1.5 tracking-wide">
                Pasta Padrão de Download
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={defaultDownloadDir}
                  onChange={(e) => setDefaultDownloadDir(e.target.value)}
                  placeholder="Ex: C:\Users\nome\Downloads"
                  className="flex-1 min-w-0 px-3.5 py-2.5 glass-input rounded-xl text-xs sm:text-sm font-mono font-medium text-slate-800 outline-none truncate"
                />
                <button
                  type="button"
                  onClick={handleBrowseFolder}
                  disabled={isBrowsingFolder}
                  title="Selecionar pasta no computador"
                  className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 disabled:opacity-75 ${
                    folderSelected
                    ? 'glass-button-success'
                      : 'glass-button'
                  }`}
                >
                  {folderSelected ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" strokeWidth={1.5} />
                  ) : (
                    <FolderOpen className="w-4 h-4 text-blue-600" strokeWidth={1.5} />
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
                  className="flex items-center gap-1.5 px-3.5 py-2.5 glass-button text-xs font-bold cursor-pointer shrink-0"
                >
                  {openingFolder ? (
                    <Loader2 className="w-4 h-4 animate-spin text-slate-600" strokeWidth={1.5} />
                  ) : (
                    <ExternalLink className="w-4 h-4 text-slate-600" strokeWidth={1.5} />
                  )}
                  <span className="hidden sm:inline">Abrir</span>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1.5 tracking-wide">
                Limite de Downloads Concorrentes
              </label>
              <select
                value={maxConcurrentDownloads}
                onChange={(e) => setMaxConcurrentDownloads(parseInt(e.target.value, 10))}
                className="w-full px-3.5 py-2.5 glass-select rounded-xl text-sm font-medium text-slate-800 cursor-pointer"
              >
                <option value={1}>1 processo por vez (Recomendado para conexões modestas)</option>
                <option value={2}>2 processos concorrentes (Equilíbrio ideal)</option>
                <option value={3}>3 processos concorrentes</option>
                <option value={4}>4 processos concorrentes</option>
                <option value={5}>5 processos concorrentes (Conexões ultrarrápidas)</option>
              </select>
            </div>
          </div>

          {message && (
            <div
              className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                message.type === 'success'
                  ? 'glass-pill !bg-emerald-50/50 text-emerald-600 !border-emerald-200/50'
                  : 'glass-pill !bg-rose-50/50 text-rose-600 !border-rose-200/50'
              }`}
            >
              {message.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" strokeWidth={1.5} />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" strokeWidth={1.5} />
              )}
              <span>{message.text}</span>
            </div>
          )}

          {/* Ações */}
          <div className="pt-4 border-t border-white/30 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 glass-button text-xs sm:text-sm font-semibold cursor-pointer"
            >
              Fechar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 px-5 py-2.5 liquid-button font-semibold text-xs sm:text-sm cursor-pointer"
            >
              <Save className="w-4 h-4" strokeWidth={1.5} />
              <span>{saving ? 'Salvando...' : 'Salvar Alterações'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
