import { openDownloadFolder, selectDownloadFolder } from '../utils/system.js';
import React, { useState, useEffect, useRef } from 'react';
import { Download, Clipboard, Search, Loader2, X, FolderOpen, ExternalLink, Pencil, Check, RotateCcw } from 'lucide-react';
import {
  CreateDownloadPayload,
  VideoContainer,
  AudioFormat,
  AudioQuality,
  VideoMetadata,
} from '../types/download.js';
import { normalizeMediaUrl, isLikelyMediaUrl } from '../utils/url.js';
import { formatFriendlyErrorMessage } from '../utils/error.js';
import { Button, Field, MediaTitle, Notice, Modal, Tabs } from './ui.js';
import { errorMessage } from '../utils/api.js';
import { DiagnosticDetails } from './DiagnosticDetails.js';
import { PagedText } from './PagedText.js';
import { normalizeFileStem } from '@ytdlp/shared';

interface DownloaderCardProps {
  url: string;
  diagnosticId?: string;
  onChangeUrl: (url: string) => void;
  onFetchMetadata: (url: string) => Promise<boolean>;
  onCancelMetadata: () => void;
  isLoadingMetadata: boolean;
  metadata: VideoMetadata | null;
  onClearMetadata: () => void;
  options: CreateDownloadPayload;
  onChangeOptions: (options: CreateDownloadPayload) => void;
  defaultFolder: string;
  onStartDownload: (filename?: string) => void;
  isStartingDownload: boolean;
  actionError: string | null;
  onDismissError: () => void;
}

export const DownloaderCard: React.FC<DownloaderCardProps> = ({
  url,
  diagnosticId,
  onChangeUrl,
  onFetchMetadata,
  onCancelMetadata,
  isLoadingMetadata,
  metadata,
  onClearMetadata,
  options,
  onChangeOptions,
  defaultFolder,
  onStartDownload,
  isStartingDownload,
  actionError,
  onDismissError,
}) => {
  const [compactView, setCompactView] = useState<'media' | 'options'>('media');
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState('');
  const nameRef = useRef<HTMLInputElement>(null);
  const nameRowRef = useRef<HTMLDivElement>(null);
  const wasRenaming = useRef(false);
  const operationOpener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (renaming) { nameRef.current?.focus(); nameRef.current?.select(); }
    else if (wasRenaming.current) nameRowRef.current?.querySelector<HTMLButtonElement>('[data-rename]')?.focus();
    wasRenaming.current = renaming;
  }, [renaming]);
  const [showError, setShowError] = useState(false);
  useEffect(() => { if (actionError) setCompactView('media'); }, [actionError]);
  const [showWarnings, setShowWarnings] = useState(false);
  const [showFilename, setShowFilename] = useState(false);
  useEffect(() => { if (!url) { setCompactView('media'); setRenaming(false); } }, [url]);
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [isOpeningFolder, setIsOpeningFolder] = useState(false);
  const [folderSelected, setFolderSelected] = useState(false);
  const lastAttemptedUrlRef = useRef<string>('');
  const folderSelectedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (folderSelectedTimeoutRef.current) {
        clearTimeout(folderSelectedTimeoutRef.current);
      }
    };
  }, []);

  // Auto-fetch inteligente com debounce de 450ms ao digitar
  useEffect(() => {
    const trimmed = url.trim();
    if (!trimmed) {
      lastAttemptedUrlRef.current = '';
      if (metadata) {
        onClearMetadata();
      }
      return;
    }

    if (!isLikelyMediaUrl(trimmed)) {
      return;
    }

    const normalized = normalizeMediaUrl(trimmed);
    if (normalized === lastAttemptedUrlRef.current) {
      return;
    }

    const timer = setTimeout(() => {
      lastAttemptedUrlRef.current = normalized;
      void onFetchMetadata(normalized).then(success => { if (!success && lastAttemptedUrlRef.current === normalized) lastAttemptedUrlRef.current = ''; });
    }, 450);

    return () => clearTimeout(timer);
  }, [url, onFetchMetadata]);

  const triggerImmediateFetch = (rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed) return;
    onCancelMetadata();
    onChangeUrl(trimmed);
    onDismissError();

    if (isLikelyMediaUrl(trimmed)) {
      const normalized = normalizeMediaUrl(trimmed);
      lastAttemptedUrlRef.current = normalized;
      onFetchMetadata(normalized);
    }
  };

  const handleUrlChange = (nextUrl: string) => {
    if (nextUrl !== url) {
      lastAttemptedUrlRef.current = '';
      onCancelMetadata();
      if (actionError) onDismissError();
    }
    onChangeUrl(nextUrl);
  };

  const handlePasteClick = async () => {
    operationOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setPasteError(null);
        triggerImmediateFetch(text);
      }
    } catch {
      setPasteError('Permissão para área de transferência negada');

    }
  };

  const handleInputPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const pastedText = e.clipboardData.getData('text');
    if (pastedText && isLikelyMediaUrl(pastedText)) {
      e.preventDefault();
      triggerImmediateFetch(pastedText);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (trimmed) {
      const normalized = normalizeMediaUrl(trimmed);
      lastAttemptedUrlRef.current = normalized;
      onFetchMetadata(normalized);
    }
  };

  const handleClear = () => {
    lastAttemptedUrlRef.current = '';
    onCancelMetadata();
    onChangeUrl('');
    onClearMetadata();
    onDismissError();
  };

  const isVideo = options.mode === 'video';

  const update = <K extends keyof CreateDownloadPayload>(key: K, value: CreateDownloadPayload[K]) => {
    onChangeOptions({
      ...options,
      [key]: value,
    });
  };

  const handleBrowseFolder = async () => {
    operationOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setIsBrowsing(true);
    setFolderError(null);
    try {
      const currentFolder = options.outputDir || defaultFolder;
      const selectedPath = await selectDownloadFolder(currentFolder);

      if (selectedPath) {
        update('outputDir', selectedPath);
        setFolderSelected(true);
        if (folderSelectedTimeoutRef.current) {
          clearTimeout(folderSelectedTimeoutRef.current);
        }
        folderSelectedTimeoutRef.current = setTimeout(() => {
          setFolderSelected(false);
        }, 2000);
      }
    } catch (err) {
      setFolderError(errorMessage(err));
    } finally {
      setIsBrowsing(false);
    }
  };

  const handleOpenFolder = async () => {
    operationOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const currentFolder = options.outputDir || defaultFolder;
    if (!currentFolder) return;
    setIsOpeningFolder(true);
    setFolderError(null);
    try {
      await openDownloadFolder(currentFolder);
    } catch (err) {
      setFolderError(errorMessage(err));
    } finally {
      setIsOpeningFolder(false);
    }
  };

  const resolutions = metadata?.availableResolutions || [];

  const ext = isVideo ? options.videoContainer || 'mp4' : options.audioFormat || 'mp3';
  const baseName = options.customFilename?.trim() || metadata?.title || 'titulo_do_video';
  const previewFilename = `${normalizeFileStem(baseName)}.${ext}`;

  const folder = options.outputDir || defaultFolder;


  const beginRename = () => { setDraftName((options.customFilename || metadata?.title || '').slice(0, 200)); setRenaming(true); };
  const confirmRename = () => { update('customFilename', draftName.trim()); setRenaming(false); };

  return <section className="glass-card ui-downloader" aria-labelledby="download-heading">
    <header className="ui-pane-header"><h1 id="download-heading">Novo download</h1></header>
    <div className="ui-compact-nav"><Tabs label="Painel compacto" prefix="compact-download" value={compactView} onChange={setCompactView}
      items={[{ value: 'media', label: 'Mídia' }, { value: 'options', label: 'Opções' }]} /></div>
    <div className={'ui-pane-body ui-combined-form ui-compact-' + compactView}>
      <div className="ui-media-block">
        <form onSubmit={handleSubmit}>
          <Field id="media-url" label="Link do vídeo ou post">
            <div className="ui-url-row">
              <input id="media-url" className="ui-input" inputMode="url" value={url} onChange={event => handleUrlChange(event.target.value)}
                onPaste={handleInputPaste} placeholder="Cole o link aqui…" autoComplete="off" autoCorrect="off" spellCheck={false} required />
              {url && <Button iconOnly onClick={handleClear} aria-label="Limpar link"><X /></Button>}
              <Button onClick={handlePasteClick} aria-label="Colar link"><Clipboard /><span className="ui-button-label">Colar</span></Button>
              <Button type="submit" aria-label={isLoadingMetadata ? 'Analisando…' : 'Analisar'} className="ui-analyze" disabled={isLoadingMetadata || !url.trim()}>
                {isLoadingMetadata ? <Loader2 className="animate-spin" /> : <Search />}<span className="ui-button-label">{isLoadingMetadata ? 'Analisando…' : 'Analisar'}</span>
              </Button>
            </div>
          </Field>
        </form>
        {actionError && <Notice><div className="ui-error-summary"><p className="ui-clamp">{formatFriendlyErrorMessage(actionError)}</p>
          <div className="ui-actions"><Button onClick={() => setShowError(true)}>Detalhes do erro</Button><Button iconOnly onClick={onDismissError} aria-label="Dispensar erro"><X /></Button></div></div></Notice>}
        {isLoadingMetadata && <p className="ui-meta" role="status">Buscando informações da mídia…</p>}
        {metadata && !actionError && <div className="ui-reading ui-preview">
          {metadata.thumbnail && <img src={metadata.thumbnail} alt="" />}
          <div className="ui-preview-content">
            <MediaTitle title={metadata.title} heading />
            <div className="ui-meta-row ui-meta">
              {metadata.uploader && <span title={metadata.uploader}>{metadata.uploader}</span>}
              {metadata.durationString && <span className="font-mono">{metadata.durationString}</span>}
              {metadata.availableResolutions.length > 0 && <span>Até {metadata.availableResolutions[0]}</span>}
            </div>
            {(metadata.kind === 'collection' || metadata.warnings.length > 0) && <button type="button" className="ui-text-button" onClick={() => setShowWarnings(true)}>
              {metadata.kind === 'collection' ? 'Coleção com ' + metadata.entries.length + ' mídias · detalhes' : 'Avisos da origem'}
            </button>}
          </div>
        </div>}
        {!metadata && !isLoadingMetadata && !actionError && <p className="ui-help ui-intro">YouTube, Instagram, TikTok, Twitter/X e outros sites. Cole um link para ver a mídia.</p>}
      </div>
      <div className="ui-options-block">
        <div className="ui-format-band">
          <fieldset className="ui-mode" aria-label="Tipo de download">
            <legend>Baixar como</legend>
            <div className="ui-mode-controls">
              <label><input type="radio" name="download-mode" value="video" checked={isVideo} onChange={() => update('mode', 'video')} /><span>Vídeo</span></label>
              <label><input type="radio" name="download-mode" value="audio" checked={!isVideo} onChange={() => update('mode', 'audio')} /><span>Áudio</span></label>
            </div>
          </fieldset>
          {isVideo ? <>
            <Field id="video-resolution" label="Resolução máxima">
              <select id="video-resolution" className="glass-select" disabled={!metadata || !resolutions.length} value={metadata && resolutions.length ? options.videoResolution : 'best'} onChange={event => update('videoResolution', event.target.value)}>
                {resolutions.map(resolution => <option key={resolution} value={resolution}>{resolution}</option>)}
                {!resolutions.length && <option value="best">{metadata ? 'Não informada' : isLoadingMetadata ? 'Analisando…' : 'Analise o link'}</option>}
              </select>
            </Field>
            <Field id="video-container" label="Formato">
              <select id="video-container" aria-label="Formato do vídeo" className="glass-select" value={options.videoContainer || 'mp4'} onChange={event => update('videoContainer', event.target.value as VideoContainer)}>
                <option value="mp4">MP4</option><option value="mkv">MKV</option><option value="webm">WebM</option>
              </select>
            </Field>
          </> : <>
            <Field id="audio-quality" label="Qualidade">
              <select id="audio-quality" aria-label="Qualidade do áudio" className="glass-select" value={options.audioQuality || '320k'} onChange={event => update('audioQuality', event.target.value as AudioQuality)}>
                <option value="best">Melhor disponível</option><option value="320k">320 kbps</option><option value="256k">256 kbps</option><option value="192k">192 kbps</option><option value="128k">128 kbps</option>
              </select>
            </Field>
            <Field id="audio-format" label="Formato">
              <select id="audio-format" aria-label="Formato do áudio" className="glass-select" value={options.audioFormat || 'mp3'} onChange={event => update('audioFormat', event.target.value as AudioFormat)}>
                <option value="mp3">MP3</option><option value="m4a">M4A</option><option value="flac">FLAC</option><option value="wav">WAV</option><option value="opus">Opus</option>
              </select>
            </Field>
          </>}
      </div>
      {isVideo && metadata && !resolutions.length && <p className="ui-help" role="status">Resolução não informada pela origem. Será usada a melhor qualidade disponível.</p>}
      <div className="ui-output-band">
          <div className="ui-output-row">
            <label htmlFor="output-folder">Destino</label>
            <input id="output-folder" className="ui-inline-input font-mono" aria-label="Pasta de destino" title={folder} readOnly value={folder || 'Pasta padrão de downloads'} />
            <Button iconOnly onClick={handleBrowseFolder} disabled={isBrowsing} aria-label={isBrowsing ? 'Procurando pasta' : folderSelected ? 'Pasta selecionada' : 'Alterar pasta'} title="Alterar pasta"><FolderOpen /></Button>
            <Button iconOnly onClick={handleOpenFolder} disabled={!folder || isOpeningFolder} aria-label="Abrir pasta de destino" title="Abrir pasta"><ExternalLink /></Button>
          </div>
          <div className="ui-output-row ui-filename-row" ref={nameRowRef}>
            <label htmlFor={renaming ? 'custom-filename' : undefined}>Arquivo</label>
            {renaming ? <input ref={nameRef} id="custom-filename" aria-label="Nome do arquivo" className="ui-inline-input" value={draftName} maxLength={200}
              onChange={event => setDraftName(event.target.value)} onKeyDown={event => {
                if (event.key === 'Enter') { event.preventDefault(); confirmRename(); }
                if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setRenaming(false); }
              }} /> : <button type="button" className="ui-filename-value" title={previewFilename} aria-label="Ver nome completo do arquivo" onClick={() => setShowFilename(true)}>
                {metadata || options.customFilename ? previewFilename : 'Usar título da mídia'}
              </button>}
            {renaming && <span className="ui-extension">.{ext}</span>}
            <Button iconOnly data-rename onClick={renaming ? confirmRename : beginRename} aria-label={renaming ? 'Confirmar nome' : 'Renomear arquivo'} title={renaming ? 'Confirmar nome' : 'Renomear arquivo'}>{renaming ? <Check /> : <Pencil />}</Button>
            {(renaming || options.customFilename) && <Button iconOnly aria-label={renaming ? 'Cancelar renomeação' : 'Usar nome original'} title={renaming ? 'Cancelar' : 'Usar nome original'} onClick={() => {
              if (renaming) setRenaming(false); else update('customFilename', '');
            }}>{renaming ? <X /> : <RotateCcw />}</Button>}
          </div>
        </div>
      </div>
    </div>
    <footer className="ui-pane-footer">
      <div className="ui-checks">
        <label className="ui-check"><input type="checkbox" aria-label="Embutir capa" checked={Boolean(options.embedThumbnail)} onChange={event => update('embedThumbnail', event.target.checked)} /><span><span className="ui-check-prefix">Embutir </span>capa</span></label>
        {isVideo && <label className="ui-check"><input type="checkbox" aria-label="Embutir legendas" checked={Boolean(options.embedSubtitles)} onChange={event => update('embedSubtitles', event.target.checked)} /><span><span className="ui-check-prefix">Embutir </span>legendas</span></label>}
      </div>
      <Button variant="primary" className="ui-start" onClick={() => {
        if (renaming) { confirmRename(); onStartDownload(draftName.trim()); }
        else onStartDownload();
      }} disabled={isStartingDownload || isLoadingMetadata || !url.trim() || (isVideo && !metadata)}>
        {isStartingDownload ? <Loader2 className="animate-spin" /> : <Download />}{isStartingDownload ? 'Enfileirando…' : 'Iniciar download'}
      </Button>
    </footer>
    {(pasteError || folderError) && <Modal fill returnFocus={operationOpener.current} title="Falha na operação" onClose={() => { setPasteError(null); setFolderError(null); }} footer={<Button onClick={() => { setPasteError(null); setFolderError(null); }}>Fechar</Button>}><PagedText dark={false} prose label="Erro da operação" lines={[pasteError || folderError || '']} /></Modal>}
    {showError && <Modal fill title="Erro na tentativa" onClose={() => setShowError(false)} footer={<><Button onClick={() => setShowError(false)}>Fechar</Button><Button disabled={isLoadingMetadata} onClick={() => { setShowError(false); triggerImmediateFetch(url); }}>Tentar novamente</Button></>}><PagedText dark={false} prose lines={[formatFriendlyErrorMessage(actionError)]} label="Mensagem do erro" /><DiagnosticDetails id={diagnosticId} /></Modal>}
    {showWarnings && <Modal fill title="Avisos da origem" onClose={() => setShowWarnings(false)} footer={<Button onClick={() => setShowWarnings(false)}>Fechar</Button>}><PagedText dark={false} prose label="Avisos da mídia" lines={[...(metadata?.kind === 'collection' ? ['Todas as mídias acessíveis serão baixadas.'] : []), ...(metadata?.warnings || [])]} /></Modal>}
    {showFilename && <Modal fill title="Nome completo do arquivo" onClose={() => setShowFilename(false)} footer={<Button onClick={() => setShowFilename(false)}>Fechar</Button>}><PagedText dark={false} label="Nome completo do arquivo" lines={[previewFilename]} /><p className="ui-help mt-3">Se já existir um arquivo com esse nome, será acrescentado (2), (3) e assim por diante. Em coleções, cada mídia usa seu título ou o nome escolhido com esse sufixo.</p></Modal>}
  </section>;
};
