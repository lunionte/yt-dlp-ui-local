import { type Page } from '@playwright/test';
import { DownloadJobSchema, SystemStatusSchema, VideoMetadataSchema, type DownloadJob, type SSEEventData } from '@ytdlp/shared';

export const mediaUrl = 'https://www.instagram.com/reels/DeM7WlYxoAO/';
const image = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="160" height="100"><rect width="160" height="100" fill="#334155"/><path d="M65 25v50l40-25z" fill="#cbd5e1"/></svg>');
export const metadata = VideoMetadataSchema.parse({
  id: 'media', url: 'https://instagram.com/reels/DeM7WlYxoAO/', kind: 'video',
  title: 'Uma viagem pelas paisagens do Brasil — um título extenso para verificar a leitura em diferentes tamanhos de janela',
  uploader: 'Canal de viagens', duration: 180, durationString: '3:00', thumbnail: image,
  availableResolutions: ['1080p', '720p'], entries: [], warnings: [],
});
export const system = SystemStatusSchema.parse({
  config: { defaultDownloadDir: 'C:\\Users\\nome\\Downloads', maxConcurrentDownloads: 2, ytdlpPath: 'yt-dlp.exe', ffmpegPath: 'ffmpeg.exe', ffprobePath: '', isEmbedded: true },
  tools: {
    ytdlp: { available: true, version: '2026.08.19', path: 'yt-dlp.exe', embedded: true, source: 'resources', integrity: 'verified' },
    ffmpeg: { available: true, version: '8.0', path: 'ffmpeg.exe', embedded: true, source: 'resources', integrity: 'verified' },
    ffprobe: { available: false, path: '', embedded: false, source: 'path', optional: true },
  },
});
export function job(status: DownloadJob['status'] = 'downloading', id = 'job-1'): DownloadJob {
  return DownloadJobSchema.parse({
    id, title: metadata.title, url: metadata.url, thumbnail: image,
    options: { url: metadata.url, mode: 'video', outputDir: system.config.defaultDownloadDir },
    status, progress: { percent: status === 'completed' ? 100 : 82.8, percentStr: '82.8%', speed: '934 KiB/s', downloadedBytes: '2.28 MiB', totalBytes: 'NA', eta: status === 'completed' ? 'NA' : '00:01', stage: status },
    outputFiles: status === 'completed' ? ['C:\\Users\\nome\\Downloads\\video.mp4'] : [],
    logs: [], createdAt: 1, revision: 1,
  });
}
export interface Scenario {
  jobs: DownloadJob[];
  metadata: typeof metadata;
  infoDelay?: number;
  infoError?: boolean;
  refreshError?: boolean;
  folderError?: boolean;
  operationError?: boolean;
  downloadError?: boolean;
  saved?: unknown;
}

export async function mockApp(page: Page, jobs: DownloadJob[] = []) {
  const scenario: Scenario = { jobs, metadata };
  // A deterministic SSE transport. DTOs still go through the production Zod validator.
  await page.addInitScript(() => {
    class LocalEvents {
      onopen: (() => void) | null = null;
      onerror: (() => void) | null = null;
      onmessage: ((event: { data: string }) => void) | null = null;
      listener = (event: Event) => this.onmessage?.({ data: JSON.stringify((event as CustomEvent).detail) });
      disconnect = () => this.onerror?.();
      timer: ReturnType<typeof setTimeout>;
      constructor() {
        window.addEventListener('ui-test-event', this.listener);
        window.addEventListener('ui-test-disconnect', this.disconnect);
        this.timer = setTimeout(() => this.onopen?.(), 0);
      }
      close() {
        clearTimeout(this.timer);
        window.removeEventListener('ui-test-event', this.listener);
        window.removeEventListener('ui-test-disconnect', this.disconnect);
      }
    }
    Object.defineProperty(window, 'EventSource', { value: LocalEvents });
  });
  await page.route('**/api/**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/system/check') {
      if (scenario.refreshError) return route.fulfill({ status: 503, json: { error: 'Ferramentas temporariamente indisponíveis', details: { code: 'TOOL_UNAVAILABLE', phase: 'system', message: 'Ferramentas temporariamente indisponíveis', retryable: true, diagnosticId: 'fixture' } } });
      return route.fulfill({ json: system });
    }
    if (path === '/api/downloads' && request.method() === 'GET') return route.fulfill({ json: { sequence: 1, jobs: scenario.jobs } });
    if (path === '/api/info') {
      if (scenario.infoDelay) await new Promise(resolve => setTimeout(resolve, scenario.infoDelay));
      if (scenario.infoError) return route.fulfill({ status: 400, json: { error: 'Não há formato compatível com a resolução escolhida.', details: { code: 'FORMAT_UNAVAILABLE', phase: 'metadata', message: 'Não há formato compatível com a resolução escolhida.', retryable: false, diagnosticId: 'fixture' } } });
      return route.fulfill({ json: scenario.metadata });
    }
    if (path === '/api/downloads' && request.method() === 'POST') {
      if (scenario.downloadError) return route.fulfill({ status: 400, json: { error: 'Não há formato compatível.', details: { code: 'FORMAT_UNAVAILABLE', phase: 'download', message: 'Não há formato compatível.', retryable: false, diagnosticId: 'fixture' } } });
      return route.fulfill({ json: job('queued', 'new-job') });
    }
    if (path.startsWith('/api/downloads/') && scenario.operationError) return route.fulfill({ status: 409, json: { error: 'Não foi possível cancelar este download.', details: { code: 'CONFLICT', phase: 'download', message: 'Não foi possível cancelar este download.', retryable: false, diagnosticId: 'fixture' } } });
    if (path === '/api/system/config') {
      scenario.saved = request.postDataJSON();
      return route.fulfill({ json: { success: true, config: system.config } });
    }
    if (path === '/api/system/open-folder' || path === '/api/system/browse') {
      if (scenario.folderError) return route.fulfill({ status: 400, json: { error: 'Não foi possível acessar a pasta.', details: { code: 'FILESYSTEM_ERROR', phase: 'system', message: 'Não foi possível acessar a pasta.', retryable: false, diagnosticId: 'fixture' } } });
      return route.fulfill({ json: path.endsWith('/browse') ? { cancelled: false, path: 'C:\\Downloads' } : { success: true } });
    }
    if (path.includes('/diagnostics/')) return route.fulfill({ json: { id: 'fixture', error: { code: 'FORMAT_UNAVAILABLE', phase: 'download', message: 'Formato indisponível', retryable: false, diagnosticId: 'fixture' }, detail: 'Detalhes redigidos da tentativa.', context: { toolSource: 'resources' }, createdAt: 1 } });
    return route.fulfill({ json: { success: true } });
  });
  return scenario;
}

export async function emit(page: Page, event: SSEEventData) {
  await page.evaluate(value => window.dispatchEvent(new CustomEvent('ui-test-event', { detail: value })), event);
}

export async function capture(page: Page, path: string, fullPage = false) {
  await page.evaluate(async () => { await document.fonts.ready; window.scrollTo(0, 0); });
  await page.screenshot({ path, fullPage, animations: 'disabled' });
}
