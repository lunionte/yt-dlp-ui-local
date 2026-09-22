import { z } from 'zod';
import { normalizeMediaUrl } from '../utils/url.utils.js';

export const CreateDownloadSchema = z.object({
  url: z.string().min(1, 'A URL é obrigatória').transform(normalizeMediaUrl).pipe(z.string().url('URL inválida')),
  mode: z.enum(['video', 'audio']).default('video'),
  videoResolution: z.enum(['best', '2160p', '1440p', '1080p', '720p', '480p', '360p']).default('1080p'),
  videoContainer: z.enum(['mp4', 'mkv', 'webm']).default('mp4'),
  audioFormat: z.enum(['mp3', 'm4a', 'flac', 'wav', 'opus']).default('mp3'),
  audioQuality: z.enum(['best', '320k', '256k', '192k', '128k']).default('320k'),
  customFilename: z.string().max(200).optional().transform(val => val?.trim() || undefined),
  outputDir: z.string().optional(),
  embedThumbnail: z.boolean().default(false),
  embedSubtitles: z.boolean().default(false),
});


export type CreateDownloadInput = z.infer<typeof CreateDownloadSchema>;

export const UpdateConfigSchema = z.object({
  ytdlpPath: z.string().optional(),
  ffmpegPath: z.string().optional(),
  ffprobePath: z.string().optional(),
  defaultDownloadDir: z.string().optional(),
  maxConcurrentDownloads: z.number().min(1).max(5).optional(),
});

export type UpdateConfigInput = z.infer<typeof UpdateConfigSchema>;

export type DownloadStatus = 'queued' | 'downloading' | 'processing' | 'completed' | 'cancelled' | 'error';

export interface DownloadProgress {
  percent: number;
  percentStr: string;
  speed: string;
  downloadedBytes: string;
  totalBytes: string;
  eta: string;
  stage: string;
}

export interface DownloadJob {
  id: string;
  url: string;
  title: string;
  thumbnail?: string;
  duration?: number;
  options: CreateDownloadInput;
  status: DownloadStatus;
  progress: DownloadProgress;
  outputPath?: string;
  error?: string;
  logs: string[];
  createdAt: number;
  completedAt?: number;
}
