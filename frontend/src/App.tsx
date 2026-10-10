import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Settings } from 'lucide-react';
import { Button, Modal, Tabs } from './components/ui.js';
import { PagedText } from './components/PagedText.js';
import { TitleBar } from './components/TitleBar.js';
import { DownloaderCard } from './components/DownloaderCard.js';
import { DownloadsPanel } from './components/DownloadsPanel.js';
import { SettingsModal } from './components/SettingsModal.js';
import { useDownloadEvents } from './hooks/useDownloadEvents.js';
import { useWorkspaceTransition } from './hooks/useWorkspaceTransition.js';
import {
  CreateDownloadPayload,
  SystemStatus,
  VideoMetadata,
} from './types/download.js';
import { normalizeMediaUrl } from './utils/url.js';
import { AuthContextSchema, SystemStatusSchema, VideoMetadataSchema, DownloadJobSchema, type AuthContext } from '@ytdlp/shared';
import { apiRequest, ApiFailure, errorMessage } from './utils/api.js';

export const App: React.FC = () => {
  const [view, setView] = useState<'new' | 'downloads'>('new');
  const [revealDownloadId, setRevealDownloadId] = useState<string>();
  const resolutionContext = useRef('');
  const operationFocus = useRef<HTMLElement | null>(null);
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
    videoResolution: 'best',
    videoContainer: 'mp4',
    audioFormat: 'mp3',
    audioQuality: '320k',
    customFilename: '',
    embedThumbnail: false,
    embedSubtitles: false,
  });

  const { jobs, connected, hasSnapshot, cancelJob, deleteJob, operationError, clearOperationError } = useDownloadEvents();
  const hasJobs = jobs.length > 0;
  const workspace = useRef<HTMLDivElement>(null);
  useWorkspaceTransition(workspace, hasJobs, hasSnapshot, authRevision);
  const previousHasJobs = useRef(false);
  useEffect(() => {
    if (previousHasJobs.current && !hasJobs) {
      setView('new');
      if (document.activeElement === document.body || workspace.current?.querySelector('.ui-downloads-column')?.contains(document.activeElement)) {
        document.getElementById('media-url')?.focus({ preventScroll: true });
      }
    }
    previousHasJobs.current = hasJobs;
  }, [hasJobs]);
  const abortControllerRef = useRef<AbortController | null>(null);
  const metadataRequestIdRef = useRef(0);
  useEffect(() => () => { metadataRequestIdRef.current++; abortControllerRef.current?.abort(); }, []);

  // ── Electron: rastrear IDs de downloads já notificados ──
  const notifiedJobIdsRef = useRef<Set<string>>(new Set());
  const initialLoadRef = useRef(true);

  // Busca status do sistema ao carregar
  const fetchSystemStatus = useCallback(async () => {
    const data: SystemStatus = await apiRequest('/api/system/check', SystemStatusSchema);
    setSystemStatus(data);
    setDownloadOptions(previous => previous.outputDir ? previous : {
      ...previous, outputDir: data.config.defaultDownloadDir,
    });
  }, []);

  useEffect(() => {
    void fetchSystemStatus().catch(err => setActionError(errorMessage(err)));
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
      const context = `${normalized}|${authRevision}`;
      const sameMedia = resolutionContext.current === context;
      resolutionContext.current = context;
      setDownloadOptions((prev) => ({
        ...prev,
        videoResolution: sameMedia && data.availableResolutions.includes(prev.videoResolution || '')
          ? prev.videoResolution : data.availableResolutions[0] || 'best',
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
  }, [auth, authRevision]);

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
  const handleStartDownload = async (customFilename?: string) => {
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
        ...(customFilename !== undefined ? { customFilename } : {}),
        url: targetUrl,
      };

      const created = await apiRequest('/api/downloads', DownloadJobSchema, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, title: metadata?.url === targetUrl ? metadata.title : undefined, auth }),
      });

      setRevealDownloadId(created.id);
      setView('downloads');
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

  useEffect(() => {
    const retained = new Set(jobs.map(j => j.id));
    for (const id of notifiedJobIdsRef.current) if (!retained.has(id)) notifiedJobIdsRef.current.delete(id);
  }, [jobs]);

  return (
    <div className="liquid-bg">
      {/* Overlay de iluminação ambiente */}
      <div className="liquid-overlay" />

      <TitleBar sseConnected={connected} />

      <main className="app-main">
        {hasJobs && <div className="ui-mobile-nav"><Tabs label="Área de trabalho" prefix="workspace" value={view} onChange={setView} items={[{value:'new',label:'Novo download'},{value:'downloads',label:`Downloads (${jobs.length})`}]} /></div>}
        <div ref={workspace} className={`ui-workspace ui-view-${hasJobs ? view : 'new'}${hasJobs ? '' : ' ui-workspace-empty'}`}>
        <div className="ui-downloader-column" id="workspace-new-panel">
            {/* Cartão Unificado: Entrada de URL, Prévia e Opções integradas sem vão vazio */}
            <DownloaderCard
              welcome={!hasJobs}
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
              actionError={actionError}
              onDismissError={() => { setActionError(null); setActionDiagnosticId(undefined); clearOperationError(); }}
            />
          </div>

          <div className="ui-downloads-column" id="workspace-downloads-panel" inert={!hasJobs} aria-hidden={!hasJobs}><DownloadsPanel revealId={revealDownloadId} jobs={jobs} onCancel={id => { operationFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; return cancelJob(id); }} onDelete={id => { operationFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null; return deleteJob(id); }} /></div>
        </div>
      </main>
      <footer className="ui-app-footer">
        <Button iconOnly className="app-no-drag" onClick={() => setIsSettingsOpen(true)} aria-label="Abrir configurações"
          title={systemStatus && (!systemStatus.tools.ytdlp.available || !systemStatus.tools.ffmpeg.available) ? 'Configurações — ferramenta indisponível' : 'Configurações'}><Settings /></Button>
      </footer>
      {operationError && <Modal fill returnFocus={operationFocus.current} title="Falha na operação" onClose={clearOperationError} footer={<Button onClick={clearOperationError}>Fechar</Button>}><PagedText dark={false} prose label="Erro da operação" lines={[operationError]} /></Modal>}

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
