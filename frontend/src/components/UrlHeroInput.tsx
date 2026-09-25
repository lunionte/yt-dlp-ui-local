import React, { useState, useEffect, useRef } from 'react';
import { Music, Clipboard, Search, Loader2, X, Clock, User } from 'lucide-react';
import { VideoMetadata } from '../types/download.js';
import { normalizeMediaUrl, isLikelyMediaUrl } from '../utils/url.js';

interface UrlHeroInputProps {
  url: string;
  onChangeUrl: (url: string) => void;
  onFetchMetadata: (url: string) => Promise<void>;
  onCancelMetadata: () => void;
  isLoading: boolean;
  metadata: VideoMetadata | null;
  onClearMetadata: () => void;
}

export const UrlHeroInput: React.FC<UrlHeroInputProps> = ({
  url,
  onChangeUrl,
  onFetchMetadata,
  onCancelMetadata,
  isLoading,
  metadata,
  onClearMetadata,
}) => {
  const [pasteError, setPasteError] = useState<string | null>(null);
  const lastFetchedUrlRef = useRef<string>('');

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

  // Dispara busca instantânea (sem delay) ao colar
  const triggerImmediateFetch = (rawText: string) => {
    const trimmed = rawText.trim();
    if (!trimmed) return;
    onCancelMetadata();
    onChangeUrl(trimmed);

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
  };

  return (
    <div className="w-full glass-card glass-specular rounded-3xl p-8 sm:p-12 text-center relative overflow-hidden transition-all duration-300">

      {/* Tile 3D de Vidro Líquido — Ícone Central */}
      <div className="mx-auto w-20 h-20 rounded-2xl glass-tile-3d flex items-center justify-center mb-8 transition-transform duration-300 hover:scale-105">
        <Music className="w-9 h-9 text-blue-500/80 relative z-10" strokeWidth={1.5} />
      </div>

      {/* Título Editorial */}
      <h1 className="font-editorial text-3xl sm:text-4xl tracking-tight text-slate-800 mb-2.5">
        insira o link aqui ou{' '}
        <button
          type="button"
          onClick={handlePasteClick}
          className="font-editorial italic text-blue-600 hover:text-blue-700 underline underline-offset-4 decoration-blue-300 cursor-pointer transition-colors"
        >
          cole
        </button>
      </h1>

      <p className="text-xs sm:text-sm text-slate-600 font-medium mb-8 max-w-lg mx-auto tracking-wide">
        YouTube, Instagram, TikTok, SoundCloud, Bandcamp, Twitter/X e +1.000 sites
      </p>

      {/* Formulário de Entrada da URL — Cápsula de Vidro */}
      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto">
        <div className="relative flex items-center glass-input rounded-2xl transition-all">
          <input
            type="text"
            inputMode="url"
            value={url}
            onChange={(e) => handleUrlChange(e.target.value)}
            onPaste={handleInputPaste}
            placeholder="Cole ou digite o link (ex: youtube.com/watch?v=...)"
            className="font-mono w-full py-4 pl-5 pr-32 text-slate-800 placeholder:text-slate-500 text-sm bg-transparent rounded-2xl outline-none tracking-tight font-medium"
            autoComplete="off"
            autoCorrect="off"
            spellCheck="false"
            required
          />

          <div className="absolute right-2.5 flex items-center gap-1.5">
            {url && (
              <button
                type="button"
                onClick={handleClear}
                className="p-2 text-slate-500 hover:text-slate-800 rounded-lg transition cursor-pointer"
                title="Limpar campo"
              >
                <X className="w-4 h-4" strokeWidth={1.5} />
              </button>
            )}

            {!url && (
              <button
                type="button"
                onClick={handlePasteClick}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-blue-600 glass-pill rounded-xl transition cursor-pointer"
              >
                <Clipboard className="w-3.5 h-3.5" strokeWidth={1.5} />
                <span className="hidden sm:inline">Colar</span>
              </button>
            )}

            <button
              type="submit"
              disabled={isLoading || !url.trim()}
              className="flex items-center gap-1.5 px-4 py-2.5 liquid-button text-xs sm:text-sm font-bold rounded-xl cursor-pointer disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} />
                  <span className="hidden sm:inline">Analisando...</span>
                </>
              ) : (
                <>
                  <Search className="w-4 h-4" strokeWidth={1.5} />
                  <span>Analisar</span>
                </>
              )}
            </button>
          </div>
        </div>

        {pasteError && (
          <p className="text-xs text-red-500 mt-2 text-left px-2 font-medium">{pasteError}</p>
        )}
      </form>

      {/* Cartão de Prévia do Vídeo — Vidro Fosco */}
      {metadata && (
        <div className="max-w-2xl mx-auto mt-6 glass-pill rounded-2xl p-4 text-left flex flex-col sm:flex-row gap-4 items-start sm:items-center transition-all duration-200">
          {metadata.thumbnail ? (
            <img
              src={metadata.thumbnail}
              alt={metadata.title}
              className="w-full sm:w-28 h-20 object-cover rounded-xl border border-white/60 bg-slate-100/50 shrink-0"
            />
          ) : (
            <div className="w-full sm:w-28 h-20 rounded-xl glass-card flex items-center justify-center text-slate-400 shrink-0">
              <Music className="w-8 h-8" strokeWidth={1.5} />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-slate-900 text-sm line-clamp-2 leading-snug">
              {metadata.title}
            </h3>
            <div className="flex items-center gap-3 text-xs text-slate-600 mt-2">
              {metadata.uploader && (
                <span className="flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-slate-500" strokeWidth={1.5} />
                  <span className="truncate max-w-[140px] font-medium text-slate-700">{metadata.uploader}</span>
                </span>
              )}
              {metadata.durationString && (
                <span className="flex items-center gap-1 font-mono text-[11px] font-medium text-slate-700">
                  <Clock className="w-3.5 h-3.5 text-slate-500" strokeWidth={1.5} />
                  {metadata.durationString}
                </span>
              )}
              {metadata.availableResolutions.length > 0 && (
                <span className="font-mono px-2 py-0.5 rounded-md glass-segment-active text-blue-700 font-bold text-[11px]">
                  até {metadata.availableResolutions[0]}
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
