import React, { useState, useEffect, useRef } from 'react';
import { Music, Clipboard, Sparkles, Loader2, X, Clock, User } from 'lucide-react';
import { VideoMetadata } from '../types/download.js';
import { normalizeMediaUrl, isLikelyMediaUrl } from '../utils/url.js';

interface UrlHeroInputProps {
  url: string;
  onChangeUrl: (url: string) => void;
  onFetchMetadata: (url: string) => Promise<void>;
  isLoading: boolean;
  metadata: VideoMetadata | null;
  onClearMetadata: () => void;
}

export const UrlHeroInput: React.FC<UrlHeroInputProps> = ({
  url,
  onChangeUrl,
  onFetchMetadata,
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
    onChangeUrl(trimmed);

    if (isLikelyMediaUrl(trimmed)) {
      const normalized = normalizeMediaUrl(trimmed);
      lastFetchedUrlRef.current = normalized;
      onFetchMetadata(normalized);
    }
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
    onChangeUrl('');
    onClearMetadata();
  };

  return (
    <div className="w-full bg-white border border-slate-200/70 rounded-3xl p-8 sm:p-12 shadow-sm text-center relative overflow-hidden transition-all duration-300">
      {/* Ícone Central Estilo Pillowcase */}
      <div className="mx-auto w-20 h-20 rounded-2xl bg-blue-50/70 flex items-center justify-center text-blue-600 mb-6 group transition hover:scale-105">
        <Music className="w-10 h-10 stroke-[2] text-blue-600" />
      </div>

      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 mb-2">
        insira o link aqui ou{' '}
        <button
          type="button"
          onClick={handlePasteClick}
          className="text-blue-600 hover:text-blue-700 underline underline-offset-4 cursor-pointer font-bold"
        >
          cole
        </button>
      </h1>

      <p className="text-xs sm:text-sm text-slate-400 font-normal mb-8 max-w-lg mx-auto">
        YouTube, Instagram, TikTok, SoundCloud, Bandcamp, Twitter/X e +1.000 sites
      </p>

      {/* Formulário de Entrada da URL */}
      <form onSubmit={handleSubmit} className="max-w-2xl mx-auto">
        <div className="relative flex items-center shadow-xs rounded-2xl border border-slate-200 bg-white hover:border-slate-300 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-100 transition">
          <input
            type="text"
            inputMode="url"
            value={url}
            onChange={(e) => onChangeUrl(e.target.value)}
            onPaste={handleInputPaste}
            placeholder="Cole ou digite o link (ex: youtube.com/watch?v=...)"
            className="w-full py-4 pl-5 pr-28 text-slate-800 placeholder:text-slate-400 text-sm sm:text-base bg-transparent rounded-2xl outline-none"
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
                className="p-2 text-slate-400 hover:text-slate-600 rounded-lg transition cursor-pointer"
                title="Limpar campo"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            {!url && (
              <button
                type="button"
                onClick={handlePasteClick}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-blue-600 bg-slate-50 hover:bg-blue-50 rounded-xl transition cursor-pointer"
              >
                <Clipboard className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Colar</span>
              </button>
            )}

            <button
              type="submit"
              disabled={isLoading || !url.trim()}
              className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 text-white text-xs sm:text-sm font-semibold rounded-xl transition shadow-xs cursor-pointer disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="hidden sm:inline">Analisando...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Analisar</span>
                </>
              )}
            </button>
          </div>
        </div>

        {pasteError && (
          <p className="text-xs text-red-500 mt-2 text-left px-2">{pasteError}</p>
        )}
      </form>

      {/* Cartão de Prévia do Vídeo Encontrado */}
      {metadata && (
        <div className="max-w-2xl mx-auto mt-6 bg-slate-50/80 border border-slate-200/80 rounded-2xl p-4 text-left flex flex-col sm:flex-row gap-4 items-start sm:items-center transition animate-in fade-in duration-200">
          {metadata.thumbnail ? (
            <img
              src={metadata.thumbnail}
              alt={metadata.title}
              className="w-full sm:w-28 h-20 object-cover rounded-xl border border-slate-200 bg-slate-100 shrink-0"
            />
          ) : (
            <div className="w-full sm:w-28 h-20 rounded-xl bg-slate-200 flex items-center justify-center text-slate-400 shrink-0">
              <Music className="w-8 h-8" />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-slate-900 text-sm line-clamp-2 leading-snug">
              {metadata.title}
            </h3>
            <div className="flex items-center gap-3 text-xs text-slate-500 mt-2">
              {metadata.uploader && (
                <span className="flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  <span className="truncate max-w-[140px]">{metadata.uploader}</span>
                </span>
              )}
              {metadata.durationString && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  {metadata.durationString}
                </span>
              )}
              {metadata.availableResolutions.length > 0 && (
                <span className="px-2 py-0.5 rounded-md bg-blue-100 text-blue-700 font-medium text-[11px]">
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
