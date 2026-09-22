import path from 'node:path';
import fs from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadConfig } from '../config/paths.js';
import { PROGRESS_PREFIX } from './parser.service.js';
import { normalizeMediaUrl } from '../utils/url.utils.js';
const execFileAsync = promisify(execFile);
const metadataCache = new Map();
const inFlightFetches = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutos
export async function fetchVideoInfo(rawUrl) {
    const normalizedUrl = normalizeMediaUrl(rawUrl);
    // 1. Verificação no cache de memória
    const cached = metadataCache.get(normalizedUrl);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.data;
    }
    // 2. Deduplicação de requisições concorrentes (se já estiver buscando a mesma URL, aguarda a mesma promessa)
    if (inFlightFetches.has(normalizedUrl)) {
        return inFlightFetches.get(normalizedUrl);
    }
    const fetchPromise = (async () => {
        const config = loadConfig();
        const ytdlpPath = config.ytdlpPath;
        // Flags de alta performance para extração rápida de metadados
        const buildArgs = (skipDash = true) => {
            const args = [
                '--dump-single-json',
                '--no-playlist',
                '--no-warnings',
                '--skip-download',
                '--no-check-certificates',
                '--no-call-home',
                '--socket-timeout',
                '10',
            ];
            if (skipDash && (normalizedUrl.includes('youtube.com') || normalizedUrl.includes('youtu.be'))) {
                args.push('--extractor-args', 'youtube:skip=dash');
            }
            args.push(normalizedUrl);
            return args;
        };
        let stdout = '';
        try {
            const res = await execFileAsync(ytdlpPath, buildArgs(true), {
                maxBuffer: 50 * 1024 * 1024,
                timeout: 30000,
            });
            stdout = res.stdout;
        }
        catch {
            // Fallback sem youtube:skip=dash caso o extrator específico falhe
            const res = await execFileAsync(ytdlpPath, buildArgs(false), {
                maxBuffer: 50 * 1024 * 1024,
                timeout: 30000,
            });
            stdout = res.stdout;
        }
        try {
            const data = JSON.parse(stdout);
            // Coleta resoluções disponíveis
            const resolutionsSet = new Set();
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
            const result = {
                id: data.id || 'unknown',
                title: data.title || 'Sem título',
                thumbnail: data.thumbnail,
                duration: data.duration,
                durationString: data.duration_string,
                uploader: data.uploader || data.channel,
                description: data.description ? data.description.slice(0, 300) : undefined,
                availableResolutions,
            };
            // Armazena no cache
            metadataCache.set(normalizedUrl, {
                data: result,
                expiresAt: Date.now() + CACHE_TTL_MS,
            });
            // Limpeza de cache antigo para economizar memória (máximo 100 itens)
            if (metadataCache.size > 100) {
                const oldestKey = metadataCache.keys().next().value;
                if (oldestKey)
                    metadataCache.delete(oldestKey);
            }
            return result;
        }
        catch (err) {
            throw new Error(`Falha ao obter dados do vídeo: ${err.message}`);
        }
    })();
    inFlightFetches.set(normalizedUrl, fetchPromise);
    try {
        return await fetchPromise;
    }
    finally {
        inFlightFetches.delete(normalizedUrl);
    }
}
export function buildYtdlpArgs(options) {
    const config = loadConfig();
    const args = [];
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
    }
    else {
        // Modo vídeo
        if (options.videoResolution === 'best') {
            args.push('-f', `bestvideo+bestaudio/best`);
        }
        else {
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
    // A URL sempre deve ser o último argumento (normalizada)
    args.push(normalizeMediaUrl(options.url));
    return { args, outputFolder };
}
