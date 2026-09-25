import React, { useState, useRef, useEffect } from 'react';
import {
  Video,
  Music,
  Download,
  FileText,
  SlidersHorizontal,
  FolderOpen,
  ExternalLink,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import {
  CreateDownloadPayload,
  VideoResolution,
  VideoContainer,
  AudioFormat,
  AudioQuality,
  VideoMetadata,
} from '../types/download.js';

interface OptionsPanelProps {
  options: CreateDownloadPayload;
  onChangeOptions: (options: CreateDownloadPayload) => void;
  metadata: VideoMetadata | null;
  defaultFolder: string;
  onStartDownload: () => void;
  isStarting: boolean;
}

export const OptionsPanel: React.FC<OptionsPanelProps> = ({
  options,
  onChangeOptions,
  metadata,
  defaultFolder,
  onStartDownload,
  isStarting,
}) => {
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [isOpeningFolder, setIsOpeningFolder] = useState(false);
  const [folderSelected, setFolderSelected] = useState(false);
  const folderSelectedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (folderSelectedTimeoutRef.current) {
        clearTimeout(folderSelectedTimeoutRef.current);
      }
    };
  }, []);

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

  // Resoluções disponíveis
  const resolutions: { label: string; value: VideoResolution }[] = [
    { label: 'Melhor Disponível (Best)', value: 'best' },
    { label: '4K (2160p)', value: '2160p' },
    { label: '2K (1440p)', value: '1440p' },
    { label: 'Full HD (1080p)', value: '1080p' },
    { label: 'HD (720p)', value: '720p' },
    { label: 'SD (480p)', value: '480p' },
    { label: 'Baixa (360p)', value: '360p' },
  ];

  // Prévia do nome do arquivo
  const ext = isVideo ? options.videoContainer || 'mp4' : options.audioFormat || 'mp3';
  const baseName = options.customFilename?.trim() || metadata?.title || 'titulo_do_video';
  const previewFilename = `${baseName.replace(/[\\/:*?"<>|]/g, '_')}.${ext}`;

  return (
    <div className="w-full glass-card glass-specular rounded-3xl p-6 sm:p-8 transition-all duration-300">
      <div className="flex items-center justify-between pb-4 mb-6 border-b border-white/40">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-blue-600" strokeWidth={1.5} />
          <h2 className="text-xs font-bold uppercase tracking-wider text-slate-800">
            Opções de Formato e Saída
          </h2>
        </div>

        {/* Segmented Control — Vidro Polido */}
        <div className="flex items-center p-1 glass-segment rounded-xl">
          <button
            type="button"
            onClick={() => update('mode', 'video')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              isVideo
                ? 'glass-segment-active text-blue-600'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Video className="w-3.5 h-3.5" strokeWidth={1.5} />
            Vídeo
          </button>
          <button
            type="button"
            onClick={() => update('mode', 'audio')}
            className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              !isVideo
                ? 'glass-segment-active text-blue-600'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Music className="w-3.5 h-3.5" strokeWidth={1.5} />
            Somente Áudio
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* Opções específicas de Vídeo */}
        {isVideo ? (
          <>
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1.5 tracking-wide">
                Resolução Máxima
              </label>
              <select
                value={options.videoResolution}
                onChange={(e) => update('videoResolution', e.target.value as VideoResolution)}
                className="w-full px-3.5 py-2.5 glass-select rounded-xl text-sm font-medium text-slate-800 cursor-pointer"
              >
                {resolutions.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1.5 tracking-wide">
                Container / Formato do Vídeo
              </label>
              <select
                value={options.videoContainer}
                onChange={(e) => update('videoContainer', e.target.value as VideoContainer)}
                className="w-full px-3.5 py-2.5 glass-select rounded-xl text-sm font-medium text-slate-800 cursor-pointer"
              >
                <option value="mp4">MP4 (Recomendado / Compatibilidade universal)</option>
                <option value="mkv">MKV (Suporta múltiplas faixas de áudio e legendas)</option>
                <option value="webm">WebM (VP9/AV1)</option>
              </select>
            </div>
          </>
        ) : (
          /* Opções específicas de Áudio */
          <>
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1.5 tracking-wide">
                Formato do Áudio
              </label>
              <select
                value={options.audioFormat}
                onChange={(e) => update('audioFormat', e.target.value as AudioFormat)}
                className="w-full px-3.5 py-2.5 glass-select rounded-xl text-sm font-medium text-slate-800 cursor-pointer"
              >
                <option value="mp3">MP3 (Mais compatível com todos os players)</option>
                <option value="m4a">M4A / AAC (Ótima fidelidade e leve)</option>
                <option value="flac">FLAC (Lossless / Sem perdas)</option>
                <option value="wav">WAV (Áudio não comprimido)</option>
                <option value="opus">OPUS (Moderno / Alta eficiência)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1.5 tracking-wide">
                Qualidade / Bitrate
              </label>
              <select
                value={options.audioQuality}
                onChange={(e) => update('audioQuality', e.target.value as AudioQuality)}
                className="w-full px-3.5 py-2.5 glass-select rounded-xl text-sm font-medium text-slate-800 cursor-pointer"
              >
                <option value="320k">320 kbps (Alta Qualidade)</option>
                <option value="256k">256 kbps (Qualidade Média-Alta)</option>
                <option value="192k">192 kbps (Padrão)</option>
                <option value="128k">128 kbps (Compacto)</option>
                <option value="best">Melhor qualidade original da fonte</option>
              </select>
            </div>
          </>
        )}

        {/* Nome Personalizado */}
        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1.5 tracking-wide">
            Nome do Arquivo (Opcional)
          </label>
          <input
            type="text"
            value={options.customFilename || ''}
            onChange={(e) => update('customFilename', e.target.value)}
            placeholder="Deixe em branco para usar o título original"
            className="w-full px-3.5 py-2.5 glass-input rounded-xl text-sm font-medium text-slate-800 placeholder:text-slate-400 outline-none"
          />
        </div>

        {/* Pasta de Destino */}
        <div>
          <label className="block text-xs font-bold text-slate-800 mb-1.5 tracking-wide">
            Pasta de Destino
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={options.outputDir || defaultFolder}
              onChange={(e) => update('outputDir', e.target.value)}
              className="flex-1 min-w-0 px-3.5 py-2.5 glass-input rounded-xl text-xs sm:text-sm font-mono font-medium text-slate-800 outline-none truncate"
            />
            <button
              type="button"
              onClick={handleBrowseFolder}
              disabled={isBrowsing}
              title="Selecionar pasta no computador"
              className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 disabled:opacity-75 ${
                folderSelected
                  ? 'glass-pill !bg-emerald-50 text-emerald-700 !border-emerald-300'
                  : 'glass-pill text-slate-700 hover:text-slate-900'
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
              onClick={handleOpenFolder}
              disabled={isOpeningFolder || !(options.outputDir || defaultFolder)}
              title="Abrir pasta no Explorador de Arquivos do Windows"
              className="flex items-center gap-1.5 px-3.5 py-2.5 glass-pill text-slate-700 hover:text-slate-900 rounded-xl text-xs font-bold transition-all cursor-pointer shrink-0 disabled:opacity-50"
            >
              {isOpeningFolder ? (
                <Loader2 className="w-4 h-4 animate-spin text-slate-600" strokeWidth={1.5} />
              ) : (
                <ExternalLink className="w-4 h-4 text-slate-600" strokeWidth={1.5} />
              )}
              <span className="hidden sm:inline">Abrir</span>
            </button>
          </div>
        </div>
      </div>

      {/* Checkboxes de Embutir */}
      <div className="flex flex-wrap items-center gap-6 mt-6 pt-4 border-t border-white/40">
        <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={options.embedThumbnail}
            onChange={(e) => update('embedThumbnail', e.target.checked)}
            className="rounded border-slate-300/80 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
          />
          Embutir capa/thumbnail no arquivo
        </label>

        {isVideo && (
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={options.embedSubtitles}
              onChange={(e) => update('embedSubtitles', e.target.checked)}
              className="rounded border-slate-300/80 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
            />
            Embutir legendas disponíveis
          </label>
        )}
      </div>

      {/* Prévia do Arquivo e Botão de Download */}
      <div className="mt-6 pt-5 border-t border-white/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xs overflow-hidden">
          <FileText className="w-4 h-4 text-blue-600 shrink-0" strokeWidth={1.5} />
          <span className="font-bold text-slate-800 shrink-0">Prévia do nome:</span>
          <span className="font-mono text-slate-900 font-medium truncate text-[11px]" title={previewFilename}>
            {previewFilename}
          </span>
        </div>

        <button
          type="button"
          onClick={onStartDownload}
          disabled={isStarting || !options.url}
          className="w-full sm:w-auto px-6 py-3 liquid-button font-bold text-sm rounded-xl flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
        >
          <Download className="w-4 h-4" strokeWidth={1.5} />
          <span>Iniciar Download</span>
        </button>
      </div>
    </div>
  );
};
