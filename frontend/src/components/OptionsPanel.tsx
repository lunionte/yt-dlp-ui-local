import {
  Video,
  Music,
  Download,
  FileText,
  SlidersHorizontal,
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
  const isVideo = options.mode === 'video';

  const update = <K extends keyof CreateDownloadPayload>(key: K, value: CreateDownloadPayload[K]) => {
    onChangeOptions({
      ...options,
      [key]: value,
    });
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
    <div className="w-full bg-white border border-slate-200/80 rounded-3xl p-6 sm:p-8 shadow-xs mt-6 transition">
      <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-6">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="w-4 h-4 text-blue-600" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-700">
            Opções de Formato e Saída
          </h2>
        </div>

        {/* Seletor Modo Vídeo / Áudio */}
        <div className="flex items-center p-1 bg-slate-100 rounded-xl">
          <button
            type="button"
            onClick={() => update('mode', 'video')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              isVideo
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Video className="w-3.5 h-3.5" />
            Vídeo
          </button>
          <button
            type="button"
            onClick={() => update('mode', 'audio')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              !isVideo
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Music className="w-3.5 h-3.5" />
            Somente Áudio
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Opções específicas de Vídeo */}
        {isVideo ? (
          <>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Resolução Máxima
              </label>
              <select
                value={options.videoResolution}
                onChange={(e) => update('videoResolution', e.target.value as VideoResolution)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                {resolutions.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Container / Formato do Vídeo
              </label>
              <select
                value={options.videoContainer}
                onChange={(e) => update('videoContainer', e.target.value as VideoContainer)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
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
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Formato do Áudio
              </label>
              <select
                value={options.audioFormat}
                onChange={(e) => update('audioFormat', e.target.value as AudioFormat)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              >
                <option value="mp3">MP3 (Mais compatível com todos os players)</option>
                <option value="m4a">M4A / AAC (Ótima fidelidade e leve)</option>
                <option value="flac">FLAC (Lossless / Sem perdas)</option>
                <option value="wav">WAV (Áudio não comprimido)</option>
                <option value="opus">OPUS (Moderno / Alta eficiência)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Qualidade / Bitrate
              </label>
              <select
                value={options.audioQuality}
                onChange={(e) => update('audioQuality', e.target.value as AudioQuality)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
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
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Nome do Arquivo (Opcional)
          </label>
          <input
            type="text"
            value={options.customFilename || ''}
            onChange={(e) => update('customFilename', e.target.value)}
            placeholder="Deixe em branco para usar o título original"
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>

        {/* Pasta de Destino */}
        <div>
          <label className="block text-xs font-semibold text-slate-700 mb-1.5">
            Pasta de Destino
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={options.outputDir || defaultFolder}
              onChange={(e) => update('outputDir', e.target.value)}
              className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm text-slate-800 font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 truncate"
            />
          </div>
        </div>
      </div>

      {/* Checkboxes de Embutir */}
      <div className="flex flex-wrap items-center gap-6 mt-6 pt-4 border-t border-slate-100">
        <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={options.embedThumbnail}
            onChange={(e) => update('embedThumbnail', e.target.checked)}
            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
          />
          Embutir capa/thumbnail no arquivo
        </label>

        {isVideo && (
          <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={options.embedSubtitles}
              onChange={(e) => update('embedSubtitles', e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
            />
            Embutir legendas disponíveis
          </label>
        )}
      </div>

      {/* Prévia do Arquivo e Botão de Download */}
      <div className="mt-6 pt-6 border-t border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-xs text-slate-500 overflow-hidden">
          <FileText className="w-4 h-4 text-blue-500 shrink-0" />
          <span className="font-semibold text-slate-600 shrink-0">Prévia do nome:</span>
          <span className="font-mono text-slate-800 truncate" title={previewFilename}>
            {previewFilename}
          </span>
        </div>

        <button
          type="button"
          onClick={onStartDownload}
          disabled={isStarting || !options.url}
          className="w-full sm:w-auto px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 text-white font-semibold text-sm rounded-xl transition shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
        >
          <Download className="w-4 h-4" />
          <span>Iniciar Download</span>
        </button>
      </div>
    </div>
  );
};
