export type DownloadMode = 'video' | 'audio';

export type VideoResolution = 'best' | '2160p' | '1440p' | '1080p' | '720p' | '480p' | '360p';
export type VideoContainer = 'mp4' | 'mkv' | 'webm';
export type AudioFormat = 'mp3' | 'm4a' | 'flac' | 'wav' | 'opus';
export type AudioQuality = 'best' | '320k' | '256k' | '192k' | '128k';

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

export interface CreateDownloadPayload {
  url: string;
  mode: DownloadMode;
  videoResolution?: VideoResolution;
  videoContainer?: VideoContainer;
  audioFormat?: AudioFormat;
  audioQuality?: AudioQuality;
  customFilename?: string;
  outputDir?: string;
  embedThumbnail?: boolean;
  embedSubtitles?: boolean;
}

export interface DownloadJob {
  id: string;
  url: string;
  title: string;
  thumbnail?: string;
  duration?: number;
  options: CreateDownloadPayload;
  status: DownloadStatus;
  progress: DownloadProgress;
  outputPath?: string;
  error?: string;
  logs: string[];
  createdAt: number;
  completedAt?: number;
}

export interface VideoMetadata {
  id: string;
  title: string;
  thumbnail?: string;
  duration?: number;
  durationString?: string;
  uploader?: string;
  description?: string;
  availableResolutions: string[];
}

export interface SystemStatus {
  config: {
    ytdlpPath: string;
    ffmpegPath: string;
    ffprobePath: string;
    defaultDownloadDir: string;
    maxConcurrentDownloads: number;
  };
  tools: {
    ytdlp: { available: boolean; version?: string; path: string; error?: string };
    ffmpeg: { available: boolean; version?: string; path: string; error?: string };
    ffprobe: { available: boolean; version?: string; path: string; error?: string };
  };
}
