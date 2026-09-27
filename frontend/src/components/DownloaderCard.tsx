import React, { useState, useEffect, useRef } from 'react';
import {
  Download,
  Video,
  Music,
  Clipboard,
  Search,
  Loader2,
  X,
  Clock,
  User,
  SlidersHorizontal,
  FolderOpen,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import {
  CreateDownloadPayload,
  VideoResolution,
  VideoContainer,
  AudioFormat,
  AudioQuality,
  VideoMetadata,
} from '../types/download.js';
import { normalizeMediaUrl, isLikelyMediaUrl } from '../utils/url.js';
import { formatFriendlyErrorMessage } from '../utils/error.js';

interface DownloaderCardProps {
  url: string;
  onChangeUrl: (url: string) => void;
  onFetchMetadata: (url: string) => Promise<void>;
  onCancelMetadata: () => void;
  isLoadingMetadata: boolean;
  metadata: VideoMetadata | null;
  onClearMetadata: () => void;
  options: CreateDownloadPayload;
  onChangeOptions: (options: CreateDownloadPayload) => void;
  defaultFolder: string;
  onStartDownload: () => void;
  isStartingDownload: boolean;
  actionError: string | null;
  onDismissError: () => void;
}

export const DownloaderCard: React.FC<DownloaderCardProps> = ({
  url,
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
  const [pasteError, setPasteError] = useState<string | null>(null);
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [isOpeningFolder, setIsOpeningFolder] = useState(false);
  const [folderSelected, setFolderSelected] = useState(false);
  const lastFetchedUrlRef = useRef<string>('');
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
      lastFetchedUrlRef.current = '';
      if (metadata) {
        onClearMetadata();
      }
      return;
    }

    if (!isLikelyMediaUrl(trimmed)) {
      return;
    }

    const normalized = normalizeMediaUrl(trimmed);
    if (normalized === lastFetchedUrlRef.current) {
      return;
    }

    const timer = setTimeout(() => {
      lastFetchedUrlRef.current = normalized;
      onFetchMetadata(normalized);
    }, 450);

    return () => clearTimeout(timer);
  }, [url, metadata, onClearMetadata, onFetchMetadata]);

  const triggerImmediateFetch = (rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed) return;
    onCancelMetadata();
    onChangeUrl(trimmed);
    onDismissError();

    if (isLikelyMediaUrl(trimmed)) {
      const normalized = normalizeMediaUrl(trimmed);
      lastFetchedUrlRef.current = normalized;
      onFetchMetadata(normalized);
    }
  };

  const handleUrlChange = (nextUrl: string) => {
    if (nextUrl !== url) {
      lastFetchedUrlRef.current = '';
      onCancelMetadata();
      if (actionError) onDismissError();
    }
    onChangeUrl(nextUrl);
  };

  const handlePasteClick = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setPasteError(null);
        triggerImmediateFetch(text);
      }
    } catch {
      setPasteError('Permissão para área de transferência negada');
      setTimeout(() => setPasteError(null), 3000);
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
      lastFetchedUrlRef.current = normalized;
      onFetchMetadata(normalized);
    }
  };

  const handleClear = () => {
    lastFetchedUrlRef.current = '';
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
    setIsBrowsing(true);
    try {
      const currentFolder = options.outputDir || defaultFolder;
      const api = (window as any).electronAPI;
      let selectedPath: string | null = null;

      if (api?.selectFolder) {
        const result = await api.selectFolder(currentFolder);
        if (!result.cancelled && result.path) {
          selectedPath = result.path;
        }
      } else {
        const res = await fetch('/api/system/browse', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'folder',
            title: 'Selecione a pasta de destino do download',
            defaultPath: currentFolder,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.path) {
            selectedPath = data.path;
          }
        }
      }

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
      console.error('Erro ao procurar pasta de destino:', err);
    } finally {
      setIsBrowsing(false);
    }
  };

  const handleOpenFolder = async () => {
    const currentFolder = options.outputDir || defaultFolder;
    if (!currentFolder) return;
    setIsOpeningFolder(true);
    try {
      const api = (window as any).electronAPI;
      if (api?.openFolder) {
        await api.openFolder(currentFolder);
      } else {
        await fetch('/api/system/open-folder', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ folderPath: currentFolder }),
        });
      }
    } catch (err) {
      console.error('Erro ao abrir pasta no explorador:', err);
    } finally {
      setIsOpeningFolder(false);
    }
  };

  const resolutions: { label: string; value: VideoResolution }[] = [
    { label: 'Melhor Disponível (Best)', value: 'best' },
    { label: '4K (2160p)', value: '2160p' },
    { label: '2K (1440p)', value: '1440p' },
    { label: 'Full HD (1080p)', value: '1080p' },
    { label: 'HD (720p)', value: '720p' },
    { label: 'SD (480p)', value: '480p' },
    { label: 'Baixa (360p)', value: '360p' },
  ];

  const ext = isVideo ? options.videoContainer || 'mp4' : options.audioFormat || 'mp3';
  const baseName = options.customFilename?.trim() || metadata?.title || 'titulo_do_video';
  const previewFilename = `${baseName.replace(/[\\/:*?"<>|]/g, '_')}.${ext}`;

  // Define se o cabeçalho introdutório deve ficar recolhido para economizar altura vertical
  const isCompactMode = Boolean(url || metadata);

  return (
    <div className="w-full glass-card glass-specular rounded-3xl p-5 sm:p-7 transition-all duration-300 shadow-lg">
      
      {/* ── Cabeçalho Introdutório (Recolhe de forma compacta quando há conteúdo) ── */}
      {!isCompactMode ? (
        <div className="text-center mb-6 transition-all duration-300">
          {/* Tile 3D de Vidro Líquido com Ícone Multimídia */}
          <div className="mx-auto w-14 h-14 sm:w-16 sm:h-16 rounded-2xl glass-tile-3d flex items-center justify-center mb-4 transition-transform duration-300 hover:scale-105">
            <Download className="w-7 h-7 sm:w-8 sm:h-8 text-blue-500/80 relative z-10" strokeWidth={1.5} />
          </div>

          <h1 className="font-editorial text-2xl sm:text-3xl tracking-tight text-slate-800 mb-1.5">
            insira o link aqui ou{' '}
            <button
              type="button"
              onClick={handlePasteClick}
              className="font-editorial italic text-blue-600 hover:text-blue-700 underline underline-offset-4 decoration-blue-300 cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-blue-500 rounded-sm"
            >
              cole
            </button>
          </h1>

          <p className="text-xs sm:text-sm text-slate-600 font-medium max-w-xl mx-auto tracking-wide text-balance">
            YouTube, Instagram, TikTok, SoundCloud, Bandcamp, Twitter/X e +1.000 sites
          </p>
        </div>
      ) : (
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-white/30">
          <div className="flex items-center gap-2">
            <Download className="w-4 h-4 text-blue-600" strokeWidth={1.5} />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Download de Mídia
            </span>
          </div>
          <button
            type="button"
            onClick={handleClear}
            className="text-xs text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            <span>Novo link</span>
          </button>
        </div>
      )}

      {/* ── Formulário de Entrada da URL com Máscara de Gradiente Fade à Direita ── */}
      <form onSubmit={handleSubmit} className="relative w-full">
        <div className="relative flex items-center glass-input rounded-2xl transition-all">
          <input
            type="text"
            inputMode="url"
            value={url}
            onChange={(e) => handleUrlChange(e.target.value)}
            onPaste={handleInputPaste}
            placeholder="Cole ou digite o link (ex: youtube.com/watch?v=...)"
            className="font-mono w-full py-3.5 pl-4 pr-36 sm:pr-40 text-slate-800 placeholder:text-slate-500 text-xs sm:text-sm bg-transparent rounded-2xl outline-none tracking-tight font-medium [mask-image:linear-gradient(to_right,black_calc(100%-40px),transparent_100%)]"
            autoComplete="off"
            autoCorrect="off"
            spellCheck="false"
            required
          />

          {/* Gradiente sutil que esmaece suavemente URLs longas antes dos botões de ação */}
          <div className="pointer-events-none absolute right-24 sm:right-28 top-0 bottom-0 w-8 bg-gradient-to-r from-transparent to-white/70" />

          {/* Botões de Ação Embutidos no Input */}
          <div className="absolute right-2 flex items-center gap-1.5 shrink-0">
            {url && (
              <button
                type="button"
                onClick={handleClear}
                className="p-1.5 glass-icon-button cursor-pointer text-slate-500 hover:text-slate-800"
                title="Limpar campo"
                aria-label="Limpar campo"
              >
                <X className="w-3.5 h-3.5" strokeWidth={1.5} />
              </button>
            )}

            {!url && (
              <button
                type="button"
                onClick={handlePasteClick}
                className="flex items-center gap-1 px-2.5 py-1.5 glass-button text-xs font-semibold cursor-pointer"
              >
                <Clipboard className="w-3.5 h-3.5" strokeWidth={1.5} />
                <span className="hidden sm:inline">Colar</span>
              </button>
            )}

            <button
              type="submit"
              disabled={isLoadingMetadata || !url.trim()}
              className="flex items-center gap-1.5 px-3.5 py-2 liquid-button text-xs sm:text-sm font-bold cursor-pointer disabled:cursor-not-allowed"
            >
              {isLoadingMetadata ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
                  <span className="hidden sm:inline">Analisando...</span>
                </>
              ) : (
                <>
                  <Search className="w-3.5 h-3.5" strokeWidth={1.5} />
                  <span>Analisar</span>
                </>
              )}
            </button>
          </div>
        </div>

        {pasteError && (
          <p className="text-xs text-rose-500 mt-2 text-left px-2 font-medium">{pasteError}</p>
        )}
      </form>

      {/* ── Banner de Erro Sanitizado e Limpo (se houver erro) ── */}
      {actionError && (
        <div className="mt-3.5 p-3 rounded-2xl glass-pill !bg-rose-50/80 !border-rose-200/70 text-rose-700 text-xs flex items-center justify-between gap-3 shadow-xs animate-in fade-in duration-200">
          <div className="flex items-center gap-2 min-w-0">
            <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" strokeWidth={1.5} />
            <span className="font-medium truncate">{formatFriendlyErrorMessage(actionError)}</span>
          </div>
          <button
            type="button"
            onClick={onDismissError}
            className="p-1 text-rose-500 hover:text-rose-800 rounded-lg hover:bg-rose-100/50 cursor-pointer shrink-0"
            title="Fechar aviso"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ── Cartão de Prévia do Vídeo (quando metadados disponíveis) ── */}
      {metadata && (
        <div className="mt-4 glass-pill rounded-2xl p-3 sm:p-4 text-left flex flex-col sm:flex-row gap-3.5 items-start sm:items-center transition-all duration-200">
          {metadata.thumbnail ? (
            <img
              src={metadata.thumbnail}
              alt={metadata.title}
              className="w-full sm:w-24 h-16 object-cover rounded-xl border border-white/60 bg-slate-100/50 shrink-0"
            />
          ) : (
            <div className="w-full sm:w-24 h-16 rounded-xl glass-card flex items-center justify-center text-slate-400 shrink-0">
              <Video className="w-6 h-6" strokeWidth={1.5} />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-slate-900 text-xs sm:text-sm line-clamp-1 leading-snug">
              {metadata.title}
            </h3>
            <div className="flex flex-wrap items-center gap-2.5 text-xs text-slate-600 mt-1.5">
              {metadata.uploader && (
                <span className="flex items-center gap-1 text-[11px]">
                  <User className="w-3 h-3 text-slate-500" strokeWidth={1.5} />
                  <span className="truncate max-w-[140px] font-medium text-slate-700">{metadata.uploader}</span>
                </span>
              )}
              {metadata.durationString && (
                <span className="flex items-center gap-1 font-mono text-[11px] font-medium text-slate-700">
                  <Clock className="w-3 h-3 text-slate-500" strokeWidth={1.5} />
                  {metadata.durationString}
                </span>
              )}
              {metadata.availableResolutions.length > 0 && (
                <span className="font-mono px-1.5 py-0.5 rounded-md glass-segment-active text-blue-700 font-bold text-[10px]">
                  até {metadata.availableResolutions[0]}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Painel de Opções Integrado (Exibido sem vão/espaço quando há URL ou Metadados) ── */}
      {(url || metadata) && (
        <div className="mt-5 pt-4 border-t border-white/40 transition-all duration-300">
          {/* Barra Superior de Opções com Segmented Control */}
          <div className="flex items-center justify-between pb-3 mb-4">
            <div className="flex items-center gap-1.5">
              <SlidersHorizontal className="w-4 h-4 text-blue-600" strokeWidth={1.5} />
              <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                Formato e Saída
              </h2>
            </div>

            {/* Segmented Control Vídeo / Áudio */}
            <div className="flex items-center p-1 glass-segment rounded-xl">
              <button
                type="button"
                onClick={() => update('mode', 'video')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer glass-segment-button ${
                  isVideo ? 'glass-segment-active' : ''
                }`}
              >
                <Video className="w-3.5 h-3.5" strokeWidth={1.5} />
                <span>Vídeo</span>
              </button>
              <button
                type="button"
                onClick={() => update('mode', 'audio')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer glass-segment-button ${
                  !isVideo ? 'glass-segment-active' : ''
                }`}
              >
                <Music className="w-3.5 h-3.5" strokeWidth={1.5} />
                <span>Áudio</span>
              </button>
            </div>
          </div>

          {/* Grid de Configurações de Download */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {isVideo ? (
              <>
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1 tracking-wide">
                    Resolução Máxima
                  </label>
                  <select
                    value={options.videoResolution}
                    onChange={(e) => update('videoResolution', e.target.value as VideoResolution)}
                    className="w-full px-3 py-2 glass-select rounded-xl text-xs sm:text-sm font-medium text-slate-800 cursor-pointer"
                  >
                    {resolutions.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1 tracking-wide">
                    Container do Vídeo
                  </label>
                  <select
                    value={options.videoContainer}
                    onChange={(e) => update('videoContainer', e.target.value as VideoContainer)}
                    className="w-full px-3 py-2 glass-select rounded-xl text-xs sm:text-sm font-medium text-slate-800 cursor-pointer"
                  >
                    <option value="mp4">MP4 (Recomendado / Universal)</option>
                    <option value="mkv">MKV (Suporta legendas e faixas)</option>
                    <option value="webm">WebM (VP9/AV1)</option>
                  </select>
                </div>
              </>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1 tracking-wide">
                    Formato do Áudio
                  </label>
                  <select
                    value={options.audioFormat}
                    onChange={(e) => update('audioFormat', e.target.value as AudioFormat)}
                    className="w-full px-3 py-2 glass-select rounded-xl text-xs sm:text-sm font-medium text-slate-800 cursor-pointer"
                  >
                    <option value="mp3">MP3 (Mais compatível)</option>
                    <option value="m4a">M4A / AAC (Leve e alta fidelidade)</option>
                    <option value="flac">FLAC (Lossless / Sem perdas)</option>
                    <option value="wav">WAV (Áudio puro não comprimido)</option>
                    <option value="opus">OPUS (Moderno e eficiente)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1 tracking-wide">
                    Qualidade / Bitrate
                  </label>
                  <select
                    value={options.audioQuality}
                    onChange={(e) => update('audioQuality', e.target.value as AudioQuality)}
                    className="w-full px-3 py-2 glass-select rounded-xl text-xs sm:text-sm font-medium text-slate-800 cursor-pointer"
                  >
                    <option value="320k">320 kbps (Máxima / Alta Fidelidade)</option>
                    <option value="256k">256 kbps (Muito Boa)</option>
                    <option value="192k">192 kbps (Padrão)</option>
                    <option value="128k">128 kbps (Econômico)</option>
                    <option value="best">Melhor Disponível na Fonte</option>
                  </select>
                </div>
              </>
            )}

            {/* Nome do Arquivo Customizado */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1 tracking-wide">
                Nome do Arquivo (Opcional)
              </label>
              <input
                type="text"
                value={options.customFilename || ''}
                onChange={(e) => update('customFilename', e.target.value)}
                placeholder="Deixe em branco para usar o título original"
                className="w-full px-3 py-2 glass-input rounded-xl text-xs font-medium text-slate-800 outline-none"
              />
            </div>

            {/* Pasta de Destino com Procurar e Abrir */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1 tracking-wide">
                Pasta de Destino
              </label>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  readOnly
                  value={options.outputDir || defaultFolder}
                  className="flex-1 min-w-0 px-3 py-2 glass-input rounded-xl text-xs font-mono font-medium text-slate-700 outline-none truncate"
                  title={options.outputDir || defaultFolder}
                />
                <button
                  type="button"
                  onClick={handleBrowseFolder}
                  disabled={isBrowsing}
                  className="flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs font-bold glass-button cursor-pointer shrink-0"
                  title="Alterar pasta de destino"
                >
                  {folderSelected ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  ) : (
                    <FolderOpen className="w-3.5 h-3.5 text-blue-600" />
                  )}
                  <span className="hidden sm:inline">Procurar</span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenFolder}
                  disabled={isOpeningFolder}
                  className="flex items-center gap-1 px-2.5 py-2 rounded-xl text-xs font-bold glass-button cursor-pointer shrink-0"
                  title="Abrir pasta no explorador de arquivos"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-slate-600" />
                  <span className="hidden sm:inline">Abrir</span>
                </button>
              </div>
            </div>
          </div>

          {/* Opções Avançadas de Embutir */}
          <div className="flex flex-wrap items-center gap-4 mt-4 pt-3 border-t border-white/20 text-xs text-slate-700">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={options.embedThumbnail}
                onChange={(e) => update('embedThumbnail', e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <span>Embutir capa/thumbnail</span>
            </label>

            {isVideo && (
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={options.embedSubtitles}
                  onChange={(e) => update('embedSubtitles', e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <span>Embutir legendas disponíveis</span>
              </label>
            )}
          </div>

          {/* Barra de Ação Final: Prévia do Arquivo + Iniciar Download */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mt-4 pt-3 border-t border-white/30">
            <div className="text-[11px] text-slate-500 font-mono truncate max-w-sm">
              <span className="font-semibold text-slate-600">Arquivo final:</span> {previewFilename}
            </div>

            <button
              type="button"
              onClick={onStartDownload}
              disabled={isStartingDownload || !url.trim()}
              className="flex items-center justify-center gap-2 px-6 py-2.5 liquid-button font-bold text-xs sm:text-sm shadow-md cursor-pointer disabled:cursor-not-allowed"
            >
              {isStartingDownload ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Enfileirando...</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Iniciar Download</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
