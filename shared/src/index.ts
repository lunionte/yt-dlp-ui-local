import { z } from 'zod';

const tracking = new Set(['si', 'feature', 'fbclid', 'igsh', '_ga', 'gclid']);
export function normalizeMediaUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`);
    const aliases: Record<string, string> = {
      'www.youtube.com': 'youtube.com', 'm.youtube.com': 'youtube.com', 'music.youtube.com': 'youtube.com',
      'www.instagram.com': 'instagram.com', 'www.tiktok.com': 'tiktok.com',
      'twitter.com': 'x.com', 'www.twitter.com': 'x.com', 'www.x.com': 'x.com',
    };
    url.hostname = aliases[url.hostname] || url.hostname;
    if (url.hostname === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0];
      if (id) { url.hostname = 'youtube.com'; url.pathname = '/watch'; url.searchParams.set('v', id); }
    }
    if (['youtube.com', 'instagram.com', 'x.com', 'tiktok.com'].includes(url.hostname)) {
      for (const key of [...url.searchParams.keys()]) {
        if (tracking.has(key.toLowerCase()) || key.toLowerCase().startsWith('utm_')) url.searchParams.delete(key);
      }
    }
    return url.toString();
  } catch { return trimmed; }
}
export function isYoutubeUrl(input: string): boolean {
  try { return ['youtube.com', 'youtu.be'].includes(new URL(normalizeMediaUrl(input)).hostname); } catch { return false; }
}
export function isLikelyMediaUrl(input: string): boolean {
  try {
    const url = new URL(normalizeMediaUrl(input));
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
      && url.hostname.includes('.') && (url.pathname.length > 1 || url.search.length > 1);
  } catch { return false; }
}
export const MediaUrlSchema = z.string().min(1, 'A URL é obrigatória').max(4096).transform(normalizeMediaUrl)
  .refine(value => { try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password; } catch { return false; } }, 'Informe uma URL HTTP ou HTTPS sem credenciais');
export const AbsolutePathSchema = z.string().min(1).max(4096).refine(
  value => !/[\x00-\x1f]/.test(value) && /^(?:[a-z]:[\\/]|\\\\[^\\]+\\[^\\]+|\/)/i.test(value), 'Informe um caminho absoluto');
export const BrowserSchema = z.enum(['chrome', 'edge', 'firefox', 'brave', 'opera', 'vivaldi']);
export const AuthContextSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('none') }).strict(),
  z.object({ mode: z.literal('browser'), browser: BrowserSchema }).strict(),
  z.object({ mode: z.literal('file'), cookiesFile: AbsolutePathSchema }).strict(),
]);
export type AuthContext = z.infer<typeof AuthContextSchema>;
export const DownloadOptionsSchema = z.object({
  url: MediaUrlSchema, mode: z.enum(['video', 'audio']).default('video'),
  videoResolution: z.string().regex(/^(best|[1-9]\d{1,4}p)$/, 'Resolução inválida').default('1080p'),
  videoContainer: z.enum(['mp4', 'mkv', 'webm']).default('mp4'),
  audioFormat: z.enum(['mp3', 'm4a', 'flac', 'wav', 'opus']).default('mp3'),
  audioQuality: z.enum(['best', '320k', '256k', '192k', '128k']).default('320k'),
  customFilename: z.string().max(200).optional().transform(v => v?.trim() || undefined),
  outputDir: AbsolutePathSchema.optional(), embedThumbnail: z.boolean().default(false), embedSubtitles: z.boolean().default(false),
});
export const CreateDownloadSchema = DownloadOptionsSchema.extend({
  title: z.string().min(1).max(500).optional(), auth: AuthContextSchema.default({ mode: 'none' }),
}).strict();
export const InfoQuerySchema = z.object({ url: MediaUrlSchema, auth: AuthContextSchema.default({ mode: 'none' }) }).strict();
export type DownloadOptions = z.infer<typeof DownloadOptionsSchema>;
export type CreateDownloadInput = z.infer<typeof CreateDownloadSchema>;
export type CreateDownloadPayload = z.input<typeof DownloadOptionsSchema>;
export type DownloadMode = DownloadOptions['mode'];
export type VideoResolution = string;
export type VideoContainer = DownloadOptions['videoContainer'];
export type AudioFormat = DownloadOptions['audioFormat'];
export type AudioQuality = DownloadOptions['audioQuality'];
export const UserPreferencesSchema = z.object({ defaultDownloadDir: AbsolutePathSchema, maxConcurrentDownloads: z.number().int().min(1).max(5) }).strict();
export const UpdateConfigSchema = UserPreferencesSchema.partial().strict();
export type UpdateConfigInput = z.infer<typeof UpdateConfigSchema>;
export const DownloadStatusSchema = z.enum(['queued', 'downloading', 'processing', 'cancelling', 'completed', 'cancelled', 'error']);
export type DownloadStatus = z.infer<typeof DownloadStatusSchema>;
export const StageSchema = z.enum(['queued', 'downloading', 'merging', 'extracting_audio', 'processing', 'cancelling', 'completed', 'cancelled', 'error']);
export type DownloadStage = z.infer<typeof StageSchema>;
export const ProgressSchema = z.object({ percent: z.number().finite().min(0).max(100), percentStr: z.string(), speed: z.string(), downloadedBytes: z.string(), totalBytes: z.string(), eta: z.string(), stage: StageSchema });
export type DownloadProgress = z.infer<typeof ProgressSchema>;
export const ErrorCodeSchema = z.enum(['AUTH_REQUIRED', 'RATE_LIMITED', 'ACCESS_DENIED', 'UNAVAILABLE', 'UNSUPPORTED_URL', 'FORMAT_UNAVAILABLE', 'NETWORK_ERROR', 'TIMEOUT', 'EXTRACTOR_ERROR', 'TOOL_UNAVAILABLE', 'FILESYSTEM_ERROR', 'VALIDATION_ERROR', 'CONFLICT', 'CAPACITY', 'SHUTTING_DOWN', 'UNKNOWN']);
export type MediaErrorCode = z.infer<typeof ErrorCodeSchema>;
export const MediaErrorSchema = z.object({ code: ErrorCodeSchema, phase: z.enum(['metadata', 'download', 'postprocessing', 'system']), message: z.string(), retryable: z.boolean(), diagnosticId: z.string() });
export type MediaError = z.infer<typeof MediaErrorSchema>;
export const ApiErrorSchema = z.object({ error: z.string(), details: MediaErrorSchema });
export const MediaEntrySchema = z.object({ id: z.string(), title: z.string(), thumbnail: z.string().optional(), duration: z.number().finite().nonnegative().optional(), durationString: z.string().optional(), uploader: z.string().optional(), description: z.string().optional(), availableResolutions: z.array(z.string()), extractor: z.string().optional() });
export const VideoMetadataSchema = MediaEntrySchema.extend({ url: z.string(), kind: z.enum(['video', 'collection']), entries: z.array(MediaEntrySchema), warnings: z.array(z.string()) });
export type VideoMetadata = z.infer<typeof VideoMetadataSchema>;
export const DownloadJobSchema = z.object({ id: z.string(), url: z.string(), title: z.string(), thumbnail: z.string().optional(), duration: z.number().optional(), options: DownloadOptionsSchema, metadata: VideoMetadataSchema.optional(), status: DownloadStatusSchema, progress: ProgressSchema, outputPath: z.string().optional(), outputFiles: z.array(z.string()), error: z.string().optional(), errorDetails: MediaErrorSchema.optional(), logs: z.array(z.string()), createdAt: z.number(), completedAt: z.number().optional(), revision: z.number().int().nonnegative() });
export type DownloadJob = z.infer<typeof DownloadJobSchema>;
const eventBase = { jobId: z.string(), sequence: z.number().int().positive() };
export const SSEEventSchema = z.discriminatedUnion('type', [
  z.object({ ...eventBase, type: z.literal('JOB_ADDED'), payload: DownloadJobSchema }),
  z.object({ ...eventBase, type: z.literal('JOB_REMOVED'), payload: z.object({ id: z.string() }) }),
  z.object({ ...eventBase, type: z.literal('STATUS'), payload: DownloadJobSchema.partial() }),
  z.object({ ...eventBase, type: z.literal('PROGRESS'), payload: z.object({ status: DownloadStatusSchema, progress: ProgressSchema }) }),
  z.object({ ...eventBase, type: z.literal('LOG'), payload: z.object({ line: z.string(), isError: z.boolean() }) }),
]);
export type SSEEventData = z.infer<typeof SSEEventSchema>;
export const JobsSnapshotSchema = z.object({ sequence: z.number().int().nonnegative(), jobs: z.array(DownloadJobSchema) });
export type JobsSnapshot = z.infer<typeof JobsSnapshotSchema>;
export function applyJobEvent(jobs: DownloadJob[], event: SSEEventData): DownloadJob[] {
  if (event.type === 'JOB_REMOVED') return jobs.filter(j => j.id !== event.jobId || j.revision >= event.sequence);
  const existing = jobs.find(j => j.id === event.jobId);
  if (existing && existing.revision >= event.sequence) return jobs;
  if (event.type === 'JOB_ADDED') return [event.payload, ...jobs.filter(j => j.id !== event.jobId)];
  return jobs.map(job => {
    if (job.id !== event.jobId) return job;
    if (event.type === 'LOG') return { ...job, revision: event.sequence, logs: [...job.logs, event.payload.line].slice(-200) };
    return { ...job, ...event.payload, revision: event.sequence };
  });
}
const ToolSchema = z.object({ available: z.boolean(), version: z.string().optional(), path: z.string(), error: z.string().optional(), embedded: z.boolean(), source: z.enum(['resources', 'project', 'path']), optional: z.boolean().optional(), integrity: z.enum(['verified', 'unverified', 'mismatch']).optional() });
export const SystemStatusSchema = z.object({ config: UserPreferencesSchema.extend({ ytdlpPath: z.string(), ffmpegPath: z.string(), ffprobePath: z.string(), isEmbedded: z.boolean() }), tools: z.object({ ytdlp: ToolSchema, ffmpeg: ToolSchema, ffprobe: ToolSchema }) });
export type SystemStatus = z.infer<typeof SystemStatusSchema>;
export const BrowseSchema = z.object({ type: z.enum(['file', 'folder']).default('folder'), title: z.string().max(200).refine(value => !/[\x00-\x1f]/.test(value), 'Título inválido').optional(), defaultPath: AbsolutePathSchema.optional(), filter: z.string().max(300).optional() }).strict();
export const OpenFolderSchema = z.object({ folderPath: AbsolutePathSchema.optional() }).strict();
export const DialogResultSchema = z.object({ path: z.string().nullable(), cancelled: z.boolean() });
export { normalizeFileStem, FILE_STEM_MAX_BYTES } from './filename.js';
