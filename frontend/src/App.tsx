import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from './components/Header.js';
import { UrlHeroInput } from './components/UrlHeroInput.js';
import { OptionsPanel } from './components/OptionsPanel.js';
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

export const App: React.FC = () => {
  const [url, setUrl] = useState('');
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [isLoadingMetadata, setIsLoadingMetadata] = useState(false);
  const [isStartingDownload, setIsStartingDownload] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // embedThumbnail desativado por padrão conforme solicitado pelo usuário
  const [downloadOptions, setDownloadOptions] = useState<CreateDownloadPayload>({
    url: '',
    mode: 'video',
    videoResolution: '1080p',
    videoContainer: 'mp4',
    audioFormat: 'mp3',
    audioQuality: '320k',
    customFilename: '',
    embedThumbnail: false,
    embedSubtitles: false,
  });

  const { jobs, connected, cancelJob, deleteJob } = useDownloadEvents();
  const abortControllerRef = useRef<AbortController | null>(null);
  const metadataRequestIdRef = useRef(0);

  // ── Electron: rastrear IDs de downloads já notificados ──
  const notifiedJobIdsRef = useRef<Set<string>>(new Set());
  const initialLoadRef = useRef(true);

  // Busca status do sistema ao carregar
  const fetchSystemStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/system/check');
      if (res.ok) {
        const data: SystemStatus = await res.json();
        setSystemStatus(data);
        if (!downloadOptions.outputDir) {
          setDownloadOptions((prev) => ({
            ...prev,
            outputDir: data.config.defaultDownloadDir,
          }));
        }
      }
    } catch (err) {
      console.error('Falha ao checar status do sistema:', err);
    }
  }, [downloadOptions.outputDir]);

  useEffect(() => {
    fetchSystemStatus();
  }, [fetchSystemStatus]);

  // Consulta metadados de vídeo da URL com cancelamento automático de requisição anterior
  const handleFetchMetadata = useCallback(async (targetUrl: string) => {
    const normalized = normalizeMediaUrl(targetUrl);
    if (!normalized) return;

    // Cancela requisição anterior se o usuário tiver digitado ou colado outro link
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const requestId = ++metadataRequestIdRef.current;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoadingMetadata(true);
    setActionError(null);

    try {
      const res = await fetch('/api/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: normalized }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Falha ao buscar metadados');
      }

      const data: VideoMetadata = await res.json();
      if (metadataRequestIdRef.current !== requestId) return;
      setMetadata(data);
      setDownloadOptions((prev) => ({
        ...prev,
        url: normalized,
        videoResolution: data.availableResolutions[0] ? (data.availableResolutions[0] as any) : '1080p',
      }));
    } catch (err: any) {
      if (err.name === 'AbortError' || metadataRequestIdRef.current !== requestId) {
        return; // Requisição cancelada intencionalmente por uma nova
      }
      setActionError(err.message || 'Erro ao conectar ou ler URL');
      setMetadata(null);
    } finally {
      if (abortControllerRef.current === controller) {
        setIsLoadingMetadata(false);
        abortControllerRef.current = null;
      }
    }
  }, []);

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
    handleCancelMetadata();
  }, [handleCancelMetadata]);

  // Inicia o download
  const handleStartDownload = async () => {
    const rawUrl = url.trim() || downloadOptions.url;
    if (!rawUrl) {
      setActionError('Por favor, informe uma URL válida.');
      return;
    }

    const targetUrl = normalizeMediaUrl(rawUrl);
    setIsStartingDownload(true);
    setActionError(null);

    try {
      const payload: CreateDownloadPayload = {
        ...downloadOptions,
        url: targetUrl,
      };

      const res = await fetch('/api/downloads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, title: metadata?.title }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Erro ao iniciar download');
      }

      // Limpa os campos após enfileirar
      handleCancelMetadata();
      setUrl('');
      setMetadata(null);
      setDownloadOptions((prev) => ({
        ...prev,
        url: '',
        customFilename: '',
      }));
    } catch (err: any) {
      setActionError(err.message || 'Falha ao enfileirar download');
    } finally {
      setIsStartingDownload(false);
    }
  };


  // ── Electron: notificação nativa quando um download é concluído ──
  useEffect(() => {
    const api = (window as any).electronAPI;

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


  const activeJobs = jobs.filter((j) => j.status === 'downloading' || j.status === 'processing');

  // Determina se deve usar layout split (quando há conteúdo na coluna direita)
  const hasContent = url || metadata || jobs.length > 0;
  const showSplit = hasContent && jobs.length > 0;

  return (
    <div className="min-h-screen liquid-bg flex flex-col">
      {/* Overlay de iluminação ambiente */}
      <div className="fixed inset-0 liquid-overlay pointer-events-none z-0" />

      {/* Header flutuante de vidro */}
      <div className="relative z-20">
        <Header
          systemStatus={systemStatus}
          onOpenSettings={() => setIsSettingsOpen(true)}
          sseConnected={connected}
        />
      </div>

      <main className="flex-1 relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">

        {/* Layout dinâmico: centralizado → split-screen */}
        <div className={`transition-all duration-500 ease-out ${
          showSplit
            ? 'grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start'
            : 'max-w-4xl mx-auto space-y-6'
        }`}>

          {/* ══ Coluna Esquerda: Input + Opções ══ */}
          <div className={`space-y-6 ${showSplit ? 'lg:col-span-7' : ''}`}>
            {/* Aviso se binários essenciais não puderem ser inicializados */}
            {systemStatus && (!systemStatus.tools.ytdlp.available || !systemStatus.tools.ffmpeg.available) && (
              <div className="glass-pill !bg-amber-50/50 !border-amber-200/50 rounded-2xl p-4 flex items-center justify-between gap-4 text-xs text-amber-700">
                <div className="flex items-center gap-2.5">
                  <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" strokeWidth={1.5} />
                  <span>
                    Uma das ferramentas integradas (<strong>yt-dlp</strong> ou <strong>FFmpeg</strong>) não pôde ser inicializada.
                  </span>
                </div>
                <button
                  onClick={() => setIsSettingsOpen(true)}
                  className="px-3 py-1.5 liquid-button text-xs font-semibold rounded-lg cursor-pointer shrink-0"
                >
                  Ver Diagnóstico
                </button>
              </div>
            )}

            {/* Hero Card de Vidro Líquido */}
            <UrlHeroInput
              url={url}
              onChangeUrl={(val) => {
                setUrl(val);
                setDownloadOptions((prev) => ({ ...prev, url: val }));
              }}
              onFetchMetadata={handleFetchMetadata}
              onCancelMetadata={handleCancelMetadata}
              isLoading={isLoadingMetadata}
              metadata={metadata}
              onClearMetadata={handleClearMetadata}
            />

            {actionError && (
              <div className="glass-pill !bg-rose-50/50 !border-rose-200/50 text-rose-600 text-xs sm:text-sm rounded-2xl p-4 text-center">
                {actionError}
              </div>
            )}

            {/* Painel de Opções (exibido quando há URL ou metadados) */}
            {(url || metadata) && (
              <OptionsPanel
                options={{ ...downloadOptions, url: url || downloadOptions.url }}
                onChangeOptions={setDownloadOptions}
                metadata={metadata}
                defaultFolder={systemStatus?.config.defaultDownloadDir || 'Downloads'}
                onStartDownload={handleStartDownload}
                isStarting={isStartingDownload}
              />
            )}
          </div>

          {/* ══ Coluna Direita: Fila de Downloads e Histórico ══ */}
          {jobs.length > 0 && (
            <div className={`space-y-4 ${showSplit ? 'lg:col-span-5' : ''}`}>
              <div className="flex items-center justify-between pb-3 border-b border-white/30">
                <div className="flex items-center gap-2">
                  <ListFilter className="w-4 h-4 text-slate-500" strokeWidth={1.5} />
                  <h2 className="text-sm font-bold text-slate-700 tracking-tight">
                    Downloads ({jobs.length})
                  </h2>
                </div>
                {activeJobs.length > 0 && (
                  <span className="font-mono text-xs px-2.5 py-0.5 rounded-full glass-segment-active text-blue-600 font-semibold">
                    {activeJobs.length} em andamento
                  </span>
                )}
              </div>

              {/* Lista de Downloads */}
              <div className="space-y-3.5">
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

      {/* Rodapé Minimalista */}
      <footer className="relative z-10 border-t border-white/20 py-6 text-center text-xs text-slate-400">
        <p>
          yt-dlp GUI • Orquestração local segura com Node.js, Express &amp; FFmpeg
          {(window as any).electronAPI?.isElectron && (
            <span className="ml-1 text-slate-300">• Desktop</span>
          )}
        </p>
      </footer>

      {/* Modal de Configurações */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        systemStatus={systemStatus}
        onRefreshStatus={fetchSystemStatus}
      />
    </div>
  );
};

export default App;
