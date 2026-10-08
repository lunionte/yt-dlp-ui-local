import crypto from 'node:crypto';
import type { MediaError, MediaErrorCode } from '@ytdlp/shared';

const messages: Record<MediaErrorCode, string> = {
  AUTH_REQUIRED: 'O site exige uma sessão válida. Escolha autenticação nas configurações e tente novamente.',
  RATE_LIMITED: 'O site limitou as requisições. Aguarde antes de tentar novamente.',
  ACCESS_DENIED: 'O site recusou o acesso automático. Consulte o diagnóstico da tentativa.',
  UNAVAILABLE: 'A mídia foi removida, é privada ou não está disponível para esta sessão.',
  UNSUPPORTED_URL: 'Esta URL não é suportada pelo motor de download.',
  FORMAT_UNAVAILABLE: 'Não há formato compatível com a resolução ou container escolhido.',
  NETWORK_ERROR: 'Não foi possível conectar ao site. Verifique a conexão e tente novamente.',
  TIMEOUT: 'A operação excedeu o tempo limite. Tente novamente mais tarde.',
  EXTRACTOR_ERROR: 'O motor não conseguiu interpretar a resposta do site. Verifique a versão do yt-dlp.',
  TOOL_UNAVAILABLE: 'Não foi possível iniciar uma ferramenta necessária.',
  FILESYSTEM_ERROR: 'Não foi possível acessar a pasta ou arquivo solicitado.',
  VALIDATION_ERROR: 'Os dados informados são inválidos.',
  CONFLICT: 'A operação não é permitida no estado atual.',
  CAPACITY: 'O limite de tarefas foi atingido. Aguarde ou remova itens concluídos.',
  SHUTTING_DOWN: 'A aplicação está encerrando. Novas operações estão bloqueadas.',
  UNKNOWN: 'Não foi possível concluir a operação. Consulte o diagnóstico da tentativa.',
};
export function redactDiagnostic(input: string): string {
  return input.slice(0, 20000)
    .replace(/https?:\/\/[^\s"'<>]+/gi, value => {
      try { const u = new URL(value); u.username = ''; u.password = ''; if (u.search) u.search = '?[redigido]'; u.hash = ''; return u.toString(); } catch { return '[URL redigida]'; }
    })
    .replace(/(--cookies(?:-from-browser)?\s+)(?:"[^"]*"|'[^']*'|\S+)/gi, '$1[redigido]')
    .replace(/((?:authorization|cookie|sessionid|access_token|csrf_token|password)\s*[:=]\s*)[^\r\n]+/gi, '$1[redigido]')
    .replace(/[A-Z]:[\\/][^\r\n"'<>|]+/gi, '[caminho local]')
    .replace(/\/(?:Users|home)\/[^\s"'<>]+/g, '[caminho local]');
}
export interface Diagnostic {
  id: string; createdAt: number; error: MediaError; detail: string;
  context: Record<string, string | number | boolean>;
}
const diagnostics = new Map<string, Diagnostic>();
export class OperationError extends Error {
  readonly details: MediaError;
  constructor(code: MediaErrorCode, phase: MediaError['phase'], detail = '', readonly status = 500, context: Diagnostic['context'] = {}) {
    super(messages[code]);
    this.name = 'OperationError';
    this.details = { code, phase, message: messages[code], retryable: ['RATE_LIMITED', 'NETWORK_ERROR', 'TIMEOUT'].includes(code), diagnosticId: crypto.randomUUID() };
    diagnostics.set(this.details.diagnosticId, {
      id: this.details.diagnosticId, createdAt: Date.now(), error: this.details, detail: redactDiagnostic(detail),
      context: Object.fromEntries(Object.entries(context).map(([k,v]) => [k, typeof v === 'string' ? redactDiagnostic(v) : v])),
    });
    if (diagnostics.size > 100) diagnostics.delete(diagnostics.keys().next().value!);
  }
}
export function classifyFailure(error: unknown, phase: MediaError['phase'], context: Diagnostic['context'] = {}): OperationError {
  if (error instanceof OperationError) {
    const diagnostic = diagnostics.get(error.details.diagnosticId);
    if (diagnostic) for (const [key, value] of Object.entries(context)) diagnostic.context[key] = typeof value === 'string' ? redactDiagnostic(value) : value;
    return error;
  }
  const value = error as { message?: string; stderr?: string; code?: string; signal?: string };
  const raw = [value?.stderr, value?.message || String(error)].filter(Boolean).join('\n');
  const text = (value?.stderr || raw).replace(/https?:\/\/[^\s]+/gi, '[url]').toLowerCase();
  let code: MediaErrorCode = 'UNKNOWN';
  if (value?.code === 'ENOENT' || /ffmpeg not found|ffprobe not found/.test(text)) code = 'TOOL_UNAVAILABLE';
  else if (value?.code === 'EACCES' || value?.code === 'EPERM' || /no space left|permission denied/.test(text)) code = 'FILESYSTEM_ERROR';
  else if (/\b429\b|too many requests|rate.?limit/.test(text)) code = 'RATE_LIMITED';
  else if (/login required|log.?in|sign.?in|authentication|cookies|sensitive content|age.?restricted/.test(text)) code = 'AUTH_REQUIRED';
  else if (/maximum number of downloads|exceeded.*buffer|excedeu.*buffer/.test(text)) code = 'CAPACITY';
  else if (/requested format|no suitable format|not compatible|unsupported codec/.test(text)) code = 'FORMAT_UNAVAILABLE';
  else if (/private (?:video|post|account)|(?:video|media|content|post|tweet).{0,30}(?:not available|unavailable|not found)|deleted|removed|\b404\b/.test(text)) code = 'UNAVAILABLE';
  else if (/unsupported url|not a valid url/.test(text)) code = 'UNSUPPORTED_URL';
  else if (/\b403\b|forbidden|cloudflare|captcha|challenge/.test(text)) code = 'ACCESS_DENIED';
  else if (/timed? ?out|timeout|etimedout/.test(text)) code = 'TIMEOUT';
  else if (/enotfound|eai_again|econnreset|econnrefused|unable to download|network is unreachable|dns/.test(text)) code = 'NETWORK_ERROR';
  else if (/unable to extract|failed to extract|no video formats|invalid json/.test(text)) code = 'EXTRACTOR_ERROR';
  const status = code === 'RATE_LIMITED' ? 429 : code === 'TIMEOUT' ? 504 : 502;
  return new OperationError(code, phase, raw, status, context);
}
export function getDiagnostic(id: string): Diagnostic | undefined { return diagnostics.get(id); }
