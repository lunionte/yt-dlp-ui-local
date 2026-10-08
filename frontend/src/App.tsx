import React, { useState, useEffect, useCallback, useRef } from 'react';
import { TitleBar } from './components/TitleBar.js';
import { DownloaderCard } from './components/DownloaderCard.js';
import { DownloadItem } from './components/DownloadItem.js';
import { SettingsModal } from './components/SettingsModal.js';
import { useDownloadEvents } from './hooks/useDownloadEvents.js';
import {
  CreateDownloadPayload,
  SystemStatus,
  VideoMetadata,
} from './types/download.js';
import { ListFilter, AlertTriangle } from 'lucide-react';
import { normalizeMediaUrl } from './utils/url.js';
import { AuthContextSchema, SystemStatusSchema, VideoMetadataSchema, DownloadJobSchema, type AuthContext } from '@ytdlp/shared';
import { apiRequest, ApiFailure, errorMessage } from './utils/api.js';

export const App: React.FC = () => {
  const [url, setUrl] = useState('');
  const [auth, setAuth] = useState<AuthContext>({ mode: 'none' });
  const [authRevision, setAuthRevision] = useState(0);
  const [actionDiagnosticId, setActionDiagnosticId] = useState<string>();
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);
  const [isStartingDownload, setIsStartingDownload] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const closeSettings = useCallback(() => setIsSettingsOpen(false), []);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // embedThumbnail desativado por padrão conforme solicitado pelo usuário
  const [downloadOptions, setDownloadOptions] = useState<Omit<CreateDownloadPayload, 'url'>>({
    mode: 'video',
    videoResolution: '1080p',
    videoContainer: 'mp4',
    audioFormat: 'mp3',
    audioQuality: '320k',
    customFilename: '',
    embedThumbnail: false,
    embedSubtitles: false,
  });

  const { jobs, connected, cancelJob, deleteJob, operationError } = useDownloadEvents();
  const abortControllerRef = useRef<AbortController | null>(null);
  const metadataRequestIdRef = useRef(0);
  useEffect(() => () => { metadataRequestIdRef.current++; abortControllerRef.current?.abort(); }, []);

  // ── Electron: rastrear IDs de downloads já notificados ──
  const notifiedJobIdsRef = useRef<Set<string>>(new Set());
  const initialLoadRef = useRef(true);

  // Busca status do sistema ao carregar
  const fetchSystemStatus = useCallback(async () => {
    try {
      {
        const data: SystemStatus = await apiRequest('/api/system/check', SystemStatusSchema);
        setSystemStatus(data);
        setDownloadOptions((prev) => {
          if (!prev.outputDir) {
            return {
              ...prev,
              outputDir: data.config.defaultDownloadDir,
            };
          }
          return prev;
        });
      }
    } catch (err) {
      console.error('Falha ao checar status do sistema:', err);
    }
  }, []);

  useEffect(() => {
    fetchSystemStatus();
  }, [fetchSystemStatus]);

  // Consulta metadados de vídeo da URL com cancelamento automático de requisição anterior
  const handleFetchMetadata = useCallback(async (targetUrl: string) => {
    const normalized = normalizeMediaUrl(targetUrl);
    if (!normalized) return false;

    // Cancela requisição anterior se o usuário tiver digitado ou colado outro link
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const requestId = ++metadataRequestIdRef.current;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoadingMetadata(true);
    setActionError(null);
    setActionDiagnosticId(undefined);
    setMetadata(null);

    try {
      const data: VideoMetadata = await apiRequest('/api/info', VideoMetadataSchema, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: normalized, auth }),
        signal: controller.signal,
      });


      if (metadataRequestIdRef.current !== requestId) return false;
      setMetadata(data);
      setDownloadOptions((prev) => ({
        ...prev,
        videoResolution: prev.videoResolution || '1080p',
      }));
      return true;
    } catch (err: unknown) {
      if ((err instanceof Error && err.name === 'AbortError') || metadataRequestIdRef.current !== requestId) {
        return false; // Requisição cancelada intencionalmente por uma nova
      }
      setActionError(errorMessage(err));
      setActionDiagnosticId(err instanceof ApiFailure ? err.details.diagnosticId : undefined);
      setMetadata(null);
      return false;
    } finally {
      if (abortControllerRef.current === controller) {
        setIsLoadingMetadata(false);
        abortControllerRef.current = null;
      }
    }
  }, [auth]);

  const handleCancelMetadata = useCallback(() => {
    metadataRequestIdRef.current += 1;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoadingMetadata(false);
    setMetadata(null);
  }, []);

  const handleClearMetadata = useCallback(() => {
    setActionError(null);
    handleCancelMetadata();
  }, [handleCancelMetadata]);

  // Inicia o download
  const handleStartDownload = async () => {
    const rawUrl = url.trim();
    if (!rawUrl) {
      setActionError('Por favor, informe uma URL válida.');
      return;
    }

    const targetUrl = normalizeMediaUrl(rawUrl);
    setIsStartingDownload(true);
    setActionError(null);
    setActionDiagnosticId(undefined);

    try {
      const payload: CreateDownloadPayload = {
        ...downloadOptions,
        url: targetUrl,
      };

      await apiRequest('/api/downloads', DownloadJobSchema, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, title: metadata?.url === targetUrl ? metadata.title : undefined, auth }),
      });



      // Limpa os campos após enfileirar
      handleCancelMetadata();
      setUrl('');
      setMetadata(null);
      setDownloadOptions((prev) => ({
        ...prev,
        customFilename: '',
      }));
    } catch (err: unknown) {
      setActionError(errorMessage(err));
      setActionDiagnosticId(err instanceof ApiFailure ? err.details.diagnosticId : undefined);
    } finally {
      setIsStartingDownload(false);
    }
  };

  // ── Electron: notificação nativa quando um download é concluído ──
  useEffect(() => {
    const api = window.electronAPI;

    if (initialLoadRef.current) {
      // Primeira renderização: registra jobs já finalizados (sem notificar)
      for (const job of jobs) {
        if (job.status === 'completed' || job.status === 'error' || job.status === 'cancelled') {
          notifiedJobIdsRef.current.add(job.id);
        }
      }
      if (jobs.length > 0) initialLoadRef.current = false;
      return;
    }

    if (!api?.isElectron) return;

    for (const job of jobs) {
      if (job.status === 'completed' && !notifiedJobIdsRef.current.has(job.id)) {
        notifiedJobIdsRef.current.add(job.id);
        api.showNotification('Download concluído', job.title || 'Download finalizado com sucesso');
      }
    }
  }, [jobs]);

  const activeJobs = jobs.filter((j) => ['downloading', 'processing', 'cancelling'].includes(j.status));
  useEffect(() => {
    const retained = new Set(jobs.map(j => j.id));
    for (const id of notifiedJobIdsRef.current) if (!retained.has(id)) notifiedJobIdsRef.current.delete(id);
  }, [jobs]);

  // Determina se deve usar layout split (quando há conteúdo na coluna direita)
  const hasContent = url || metadata || jobs.length > 0;
  const showSplit = hasContent && jobs.length > 0;
  const isIdle = !url && !metadata && jobs.length === 0;

  return (
    <div className="min-h-screen liquid-bg flex flex-col">
      {/* Overlay de iluminação ambiente */}
      <div className="fixed inset-0 liquid-overlay pointer-events-none z-0" />

      {/* ── TopBar Fixa e Consolidada no Topo Absoluto (Logo, Status, Configurações e Controles de Janela) ── */}
      <TitleBar
        systemStatus={systemStatus}
        onOpenSettings={() => setIsSettingsOpen(true)}
        sseConnected={connected}
      />

      {/* ── Conteúdo Principal Otimizado para Visão Única (Single-Viewport) ── */}
      <main className="flex-1 relative z-10 w-full max-w-6xl xl:max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6 flex flex-col transition-all duration-500 ease-out">

        {/* Layout dinâmico: Centralizado Ocioso → Centralizado Amplo → Split-Screen */}
        <div className={`w-full transition-all duration-500 ease-out flex-1 flex flex-col ${
          isIdle
            ? 'justify-center items-center max-w-2xl xl:max-w-3xl mx-auto -mt-6 sm:-mt-10'
            : showSplit
              ? 'grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6 items-start justify-start'
              : 'max-w-3xl xl:max-w-4xl mx-auto space-y-4 justify-start'
        }`}>

          {/* ══ Coluna Esquerda: Cartão Unificado DownloaderCard (Input + Opções Contíguas) ══ */}
          <div className={`space-y-4 ${showSplit ? 'lg:col-span-7' : 'w-full'}`}>
            {/* Aviso discreto se binários essenciais não puderem ser inicializados */}
            {systemStatus && (!systemStatus.tools.ytdlp.available || !systemStatus.tools.ffmpeg.available) && (
              <div className="glass-pill !bg-amber-50/50 !border-amber-200/50 rounded-2xl p-3 flex items-center justify-between gap-3 text-xs text-amber-700">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" strokeWidth={1.5} />
                  <span>
                    Uma das ferramentas integradas (<strong>yt-dlp</strong> ou <strong>FFmpeg</strong>) não pôde ser inicializada.
                  </span>
                </div>
                <button
                  onClick={() => setIsSettingsOpen(true)}
                  className="px-2.5 py-1 glass-button text-xs font-semibold cursor-pointer shrink-0"
                >
                  Ver Diagnóstico
                </button>
              </div>
            )}

            {/* Cartão Unificado: Entrada de URL, Prévia e Opções integradas sem vão vazio */}
            <DownloaderCard
                key={authRevision}
                diagnosticId={actionDiagnosticId}
              url={url}
              onChangeUrl={(val) => { if (val !== url) handleCancelMetadata(); setUrl(val); }}
              onFetchMetadata={handleFetchMetadata}
              onCancelMetadata={handleCancelMetadata}
              isLoadingMetadata={isLoadingMetadata}
              metadata={metadata}
              onClearMetadata={handleClearMetadata}
              options={{ ...downloadOptions, url }}
              onChangeOptions={({ url: _ignoredUrl, ...options }) => setDownloadOptions(options)}
              defaultFolder={systemStatus?.config.defaultDownloadDir || ''}
              onStartDownload={handleStartDownload}
              isStartingDownload={isStartingDownload}
              actionError={actionError || operationError}
              onDismissError={() => { setActionError(null); setActionDiagnosticId(undefined); }}
            />
          </div>

          {/* ══ Coluna Direita: Fila de Downloads e Histórico (Split-Screen) ══ */}
          {jobs.length > 0 && (
            <div className={`space-y-3 ${showSplit ? 'lg:col-span-5' : ''}`}>
              <div className="flex items-center justify-between pb-2.5 border-b border-white/30">
                <div className="flex items-center gap-2">
                  <ListFilter className="w-4 h-4 text-slate-600" strokeWidth={1.5} />
                  <h2 className="text-xs sm:text-sm font-bold text-slate-800 tracking-tight">
                    Downloads ({jobs.length})
                  </h2>
                </div>
                {activeJobs.length > 0 && (
                  <span className="font-mono text-[11px] px-2.5 py-0.5 rounded-full glass-segment-active text-blue-600 font-semibold">
                    {activeJobs.length} em andamento
                  </span>
                )}
              </div>

              {/* Lista de Downloads com rolagem interna suave se houver muitos itens */}
              <div className="space-y-3 max-h-[calc(100vh-140px)] overflow-y-auto pr-1">
                {jobs.map((job) => (
                  <DownloadItem
                    key={job.id}
                    job={job}
                    onCancel={cancelJob}
                    onDelete={deleteJob}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </main>

      {/* ── Rodapé com Contraste Acessível (WCAG AA) ── */}
      <footer className="relative z-10 border-t border-white/20 py-3 text-center text-xs text-slate-600 font-medium">
        <p>
          yt-dlp GUI • Orquestração local segura com Node.js, Express &amp; FFmpeg
          {typeof window !== 'undefined' && window.electronAPI?.isElectron && (
            <span className="ml-1 text-slate-500 font-semibold">• Desktop</span>
          )}
        </p>
      </footer>

      {/* ── Modal de Configurações ── */}
      <SettingsModal
        auth={auth}
        onChangeAuth={(value) => { handleCancelMetadata(); setActionError(null); setActionDiagnosticId(undefined); setAuth(AuthContextSchema.parse(value)); setAuthRevision(prev => prev + 1); }}
        isOpen={isSettingsOpen}
        onClose={closeSettings}
        systemStatus={systemStatus}
        onRefreshStatus={fetchSystemStatus}
      />
    </div>
  );
};

export default App;
