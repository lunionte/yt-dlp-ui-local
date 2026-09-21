import path from 'node:path';
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadConfig } from '../config/paths.js';
import { CreateDownloadInput } from '../schemas/download.schema.js';
import { PROGRESS_PREFIX } from './parser.service.js';

const execFileAsync = promisify(execFile);

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

export async function fetchVideoInfo(url: string): Promise<VideoMetadata> {
  const config = loadConfig();
  const ytdlpPath = config.ytdlpPath;

  const args = [
    '--dump-single-json',
    '--no-playlist',
    '--no-warnings',
    '--skip-download',
    url,
  ];

  try {
    const { stdout } = await execFileAsync(ytdlpPath, args, {
      maxBuffer: 50 * 1024 * 1024, // 50MB para metadados detalhados com muitos formatos
      timeout: 30000,
    });

    const data = JSON.parse(stdout);
    
    // Coleta resoluções disponíveis
    const resolutionsSet = new Set<string>();
    if (Array.isArray(data.formats)) {
      for (const f of data.formats) {
        if (f.height && f.vcodec && f.vcodec !== 'none') {
          resolutionsSet.add(`${f.height}p`);
        }
      }
    }
    // Ordena do maior para o menor
    const availableResolutions = Array.from(resolutionsSet).sort((a, b) => {
      return parseInt(b, 10) - parseInt(a, 10);
    });

    return {
      id: data.id || 'unknown',
      title: data.title || 'Sem título',
      thumbnail: data.thumbnail,
      duration: data.duration,
      durationString: data.duration_string,
      uploader: data.uploader || data.channel,
      description: data.description ? data.description.slice(0, 300) : undefined,
      availableResolutions,
    };
  } catch (err: any) {
    throw new Error(`Falha ao obter dados do vídeo: ${err.message}`);
  }
}

export function buildYtdlpArgs(options: CreateDownloadInput): { args: string[]; outputFolder: string } {
  const config = loadConfig();
  const args: string[] = [];

  // Localização do FFmpeg
  if (config.ffmpegPath && fs.existsSync(config.ffmpegPath)) {
    // Passa o diretório do ffmpeg ou o caminho direto
    const ffmpegDir = path.dirname(config.ffmpegPath);
    args.push('--ffmpeg-location', ffmpegDir);
  }

  // Flags essenciais de formato e terminal
  args.push('--newline');
  args.push('--no-playlist');
  args.push('--no-colors');

  // Template de progresso determinístico
  const progressTemplate = `download:${PROGRESS_PREFIX}%(progress._percent_str)s|%(progress._speed_str)s|%(progress._total_bytes_str|progress._total_bytes_estimate_str)s|%(progress._downloaded_bytes_str)s|%(progress._eta_str)s`;
  args.push('--progress-template', progressTemplate);

  // Pasta de saída
  const outputFolder = options.outputDir && fs.existsSync(options.outputDir)
    ? options.outputDir
    : config.defaultDownloadDir;

  // Garante que a pasta exista
  if (!fs.existsSync(outputFolder)) {
    fs.mkdirSync(outputFolder, { recursive: true });
  }

  // Nome do arquivo
  let filenamePattern = '%(title)s.%(ext)s';
  if (options.customFilename) {
    // Sanitiza caracteres proibidos em nomes de arquivos do Windows
    const sanitized = options.customFilename.replace(/[\\/:*?"<>|]/g, '_');
    filenamePattern = `${sanitized}.%(ext)s`;
  }
  const outputPath = path.resolve(outputFolder, filenamePattern);
  args.push('-o', outputPath);

  if (options.mode === 'audio') {
    // Modo apenas áudio
    args.push('-x');
    args.push('--audio-format', options.audioFormat);
    if (options.audioQuality !== 'best') {
      args.push('--audio-quality', options.audioQuality);
    }
  } else {
    // Modo vídeo
    if (options.videoResolution === 'best') {
      args.push('-f', `bestvideo+bestaudio/best`);
    } else {
      const height = parseInt(options.videoResolution.replace('p', ''), 10);
      args.push('-f', `bestvideo[height<=${height}]+bestaudio/best[height<=${height}]/best`);
    }

    // Container de merge
    args.push('--merge-output-format', options.videoContainer);
  }

  // Opcionais
  if (options.embedThumbnail) {
    args.push('--embed-thumbnail');
  }
  if (options.embedSubtitles) {
    args.push('--embed-subs', '--sub-langs', 'all,-live_chat');
  }

  // A URL sempre deve ser o último argumento
  args.push(options.url);

  return { args, outputFolder };
}
