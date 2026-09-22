/**
 * Utilitários para normalização, higienização e canonicalização de URLs no frontend
 */

const TRACKING_PARAMS = new Set([
  'si',
  'feature',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'fbclid',
  'igsh',
  '_ga',
  'gclid',
]);

/**
 * Normaliza, higieniza e canonicaliza uma URL inserida pelo usuário.
 * - Adiciona https:// se nenhum protocolo for informado (ex: youtube.com/watch?v=...)
 * - Remove www. e subdomínios móveis desnecessários
 * - Canonicaliza youtu.be/ID para youtube.com/watch?v=ID
 * - Remove parâmetros de rastreamento desnecessários
 */
export function normalizeMediaUrl(input: string): string {
  let trimmed = input.trim();
  if (!trimmed) return '';

  // Se não tem protocolo http/https, adiciona https://
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = `https://${trimmed}`;
  }

  try {
    const parsed = new URL(trimmed);
    let hostname = parsed.hostname.toLowerCase();

    // Canonicalização de YouTube
    if (hostname === 'www.youtube.com' || hostname === 'm.youtube.com' || hostname === 'music.youtube.com') {
      parsed.hostname = 'youtube.com';
      hostname = 'youtube.com';
    } else if (hostname === 'youtu.be') {
      const videoId = parsed.pathname.replace(/^\/+/, '').split('/')[0];
      if (videoId) {
        parsed.hostname = 'youtube.com';
        parsed.pathname = '/watch';
        parsed.searchParams.set('v', videoId);
        hostname = 'youtube.com';
      }
    } else if (hostname === 'www.instagram.com') {
      parsed.hostname = 'instagram.com';
    } else if (hostname === 'www.tiktok.com') {
      parsed.hostname = 'tiktok.com';
    } else if (hostname === 'twitter.com' || hostname === 'www.twitter.com' || hostname === 'www.x.com') {
      parsed.hostname = 'x.com';
    }

    // Remove parâmetros de rastreamento
    for (const p of Array.from(parsed.searchParams.keys())) {
      if (TRACKING_PARAMS.has(p.toLowerCase())) {
        parsed.searchParams.delete(p);
      }
    }

    return parsed.toString();
  } catch {
    return trimmed;
  }
}

/**
 * Verifica se uma string se parece com um link de mídia completo e elegível para busca automática
 */
export function isLikelyMediaUrl(input: string): boolean {
  if (!input || typeof input !== 'string') return false;
  const trimmed = input.trim();
  if (trimmed.length < 5) return false;

  const normalized = normalizeMediaUrl(trimmed);

  try {
    const url = new URL(normalized);
    const hostname = url.hostname.toLowerCase();

    if (!hostname.includes('.') || hostname.endsWith('.')) {
      return false;
    }

    const parts = hostname.split('.');
    const tld = parts[parts.length - 1];
    if (!tld || tld.length < 2) {
      return false;
    }

    if (hostname.includes('youtube.com')) {
      return url.pathname.length > 1 || url.searchParams.has('v');
    }

    return url.pathname.length > 1 || url.search.length > 1;
  } catch {
    return false;
  }
}
