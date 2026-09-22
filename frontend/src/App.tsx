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
      setMetadata(data);
      setDownloadOptions((prev) => ({
        ...prev,
        url: normalized,
        videoResolution: data.availableResolutions[0] ? (data.availableResolutions[0] as any) : '1080p',
      }));
    } catch (err: any) {
      if (err.name === 'AbortError') {
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

  const handleClearMetadata = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoadingMetadata(false);
    setMetadata(null);
  }, []);

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
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Erro ao iniciar download');
      }

      // Limpa os campos após enfileirar
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


  const activeJobs = jobs.filter((j) => j.status === 'downloading' || j.status === 'processing');

  return (
    <div className="min-h-screen bg-slate-50/50 flex flex-col">
      <Header
        systemStatus={systemStatus}
        onOpenSettings={() => setIsSettingsOpen(true)}
        sseConnected={connected}
      />

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
        {/* Aviso se binários essenciais não forem encontrados */}
        {systemStatus && (!systemStatus.tools.ytdlp.available || !systemStatus.tools.ffmpeg.available) && (
          <div className="bg-amber-50 border border-amber-200/80 rounded-2xl p-4 flex items-center justify-between gap-4 text-xs text-amber-800">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
              <span>
                Algum dos executáveis (<strong>yt-dlp</strong> ou <strong>FFmpeg</strong>) não foi localizado automaticamente.
              </span>
            </div>
            <button
              onClick={() => setIsSettingsOpen(true)}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-semibold transition cursor-pointer"
            >
              Configurar Caminhos
            </button>
          </div>
        )}

        {/* Hero Card Estilo Pillowcase */}
        <UrlHeroInput
          url={url}
          onChangeUrl={(val) => {
            setUrl(val);
            setDownloadOptions((prev) => ({ ...prev, url: val }));
          }}
          onFetchMetadata={handleFetchMetadata}
          isLoading={isLoadingMetadata}
          metadata={metadata}
          onClearMetadata={handleClearMetadata}
        />


        {actionError && (
          <div className="bg-rose-50 border border-rose-200/80 text-rose-700 text-xs sm:text-sm rounded-2xl p-4 text-center">
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

        {/* Seção de Downloads Ativos e Histórico */}
        {jobs.length > 0 && (
          <div className="space-y-4 pt-4">
            <div className="flex items-center justify-between border-b border-slate-200/70 pb-3">
              <div className="flex items-center gap-2">
                <ListFilter className="w-4 h-4 text-slate-500" />
                <h2 className="text-sm font-bold text-slate-800 tracking-tight">
                  Downloads ({jobs.length})
                </h2>
              </div>
              {activeJobs.length > 0 && (
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-semibold">
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
      </main>

      {/* Rodapé Minimalista */}
      <footer className="border-t border-slate-100 py-6 text-center text-xs text-slate-400">
        <p>yt-dlp GUI • Orquestração local segura com Node.js, Express & FFmpeg</p>
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
