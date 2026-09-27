/**
 * Sanitiza mensagens de erro brutas provenientes do yt-dlp ou do sistema operacional,
 * transformando pilhas de CLI e termos técnicos em explicações limpas em português.
 */
export function formatFriendlyErrorMessage(raw: string | null | undefined): string {
  if (!raw) return 'Não foi possível processar a URL informada.';

  const lower = raw.toLowerCase();

  // Bloqueio por Cloudflare, Captcha ou HTTP 403
  if (lower.includes('403') || lower.includes('cloudflare') || lower.includes('anti-bot') || lower.includes('challenge')) {
    return 'O site de origem bloqueou o acesso automático (proteção anti-bot/Cloudflare). Tente outro link ou verifique se o conteúdo é público.';
  }

  // URL não suportada pelo extractor do yt-dlp
  if (lower.includes('unsupported url') || lower.includes('is not a valid url') || lower.includes('no video formats')) {
    return 'Este link não é suportado pelo motor de download ou não contém um vídeo/áudio direto.';
  }

  // Vídeo privado ou removido
  if (lower.includes('private video') || lower.includes('video unavailable') || lower.includes('this video is not available')) {
    return 'O vídeo solicitado é privado, foi removido ou não está acessível no momento.';
  }

  // ID do YouTube incorreto
  if (lower.includes('incomplete youtube id') || lower.includes('video id not found')) {
    return 'O link do YouTube informado parece estar incompleto ou com ID incorreto.';
  }

  // Timeout de conexão
  if (lower.includes('timed out') || lower.includes('timeout') || lower.includes('etimedout')) {
    return 'O servidor demorou muito para responder. Verifique sua conexão com a internet.';
  }

  // Despejos brutos de linha de comando com caminhos de arquivo locais
  if (raw.includes('Command failed:') || raw.includes('yt-dlp.exe') || raw.length > 100) {
    return 'Não foi possível extrair os dados da mídia. Verifique se a URL está correta e aberta publicamente.';
  }

  return raw;
}
