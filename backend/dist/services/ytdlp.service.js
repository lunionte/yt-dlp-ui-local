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
const MAX_CONCURRENT_METADATA_FETCHES = 2;
let activeMetadataFetches = 0;
const metadataWaiters = [];
function createAbortError() {
    const error = new Error('Consulta de metadados cancelada');
    error.name = 'AbortError';
    return error;
}
function acquireMetadataSlot(signal) {
    if (signal.aborted)
        return Promise.reject(createAbortError());
    return new Promise((resolve, reject) => {
        const start = (release) => {
            signal.removeEventListener('abort', onAbort);
            resolve(release);
        };
        const onAbort = () => {
            const index = metadataWaiters.findIndex((waiter) => waiter.onAbort === onAbort);
            if (index !== -1)
                metadataWaiters.splice(index, 1);
            reject(createAbortError());
        };
        if (activeMetadataFetches < MAX_CONCURRENT_METADATA_FETCHES) {
            activeMetadataFetches += 1;
            start(() => releaseMetadataSlot());
            return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
        metadataWaiters.push({ signal, start, reject, onAbort });
    });
}
function releaseMetadataSlot() {
    while (metadataWaiters.length > 0) {
        const waiter = metadataWaiters.shift();
        waiter.signal.removeEventListener('abort', waiter.onAbort);
        if (waiter.signal.aborted) {
            waiter.reject(createAbortError());
            continue;
        }
        waiter.start(() => releaseMetadataSlot());
        return;
    }
    activeMetadataFetches = Math.max(0, activeMetadataFetches - 1);
}
function subscribeToFetch(entry, signal) {
    if (signal?.aborted)
        return Promise.reject(createAbortError());
    entry.consumers += 1;
    return new Promise((resolve, reject) => {
        let finished = false;
        const finish = (callback) => {
            if (finished)
                return;
            finished = true;
            signal?.removeEventListener('abort', onAbort);
            entry.consumers = Math.max(0, entry.consumers - 1);
            if (!entry.settled && entry.consumers === 0)
                entry.controller.abort();
            callback();
        };
        const onAbort = () => finish(() => reject(createAbortError()));
        signal?.addEventListener('abort', onAbort, { once: true });
        entry.promise.then((data) => finish(() => resolve(data)), (error) => finish(() => reject(error)));
    });
}
function isSkipDashCompatibilityError(error) {
    const details = error;
    const message = `${details?.message || ''}\n${details?.stderr || ''}`.toLowerCase();
    return /extractor.?args|skip=dash/.test(message)
        && /invalid|unsupported|unknown|unrecognized|not recognized|no such/.test(message);
}
export async function fetchVideoInfo(rawUrl, signal) {
    const normalizedUrl = normalizeMediaUrl(rawUrl);
    if (signal?.aborted)
        throw createAbortError();
    // 1. Verificação no cache de memória
    const cached = metadataCache.get(normalizedUrl);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.data;
    }
    // 2. Deduplicação de requisições concorrentes (se já estiver buscando a mesma URL, aguarda a mesma promessa)
    const existingFetch = inFlightFetches.get(normalizedUrl);
    if (existingFetch && !existingFetch.controller.signal.aborted) {
        return subscribeToFetch(existingFetch, signal);
    }
    if (existingFetch)
        inFlightFetches.delete(normalizedUrl);
    const controller = new AbortController();
    let entry;
    const fetchPromise = (async () => {
        const releaseSlot = await acquireMetadataSlot(controller.signal);
        try {
            const config = loadConfig();
            const ytdlpPath = config.ytdlpPath;
            // Flags de alta performance para extração rápida de metadados
            const buildArgs = (skipDash = true) => {
                const args = [
                    '--dump-single-json',
                    '--no-playlist',
                    '--no-warnings',
                    '--skip-download',
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
            const deadline = Date.now() + 45000;
            const runMetadata = async (skipDash) => {
                const timeout = Math.min(30000, deadline - Date.now());
                if (timeout <= 0)
                    throw new Error('Tempo limite para consulta de metadados excedido');
                return execFileAsync(ytdlpPath, buildArgs(skipDash), {
                    maxBuffer: 50 * 1024 * 1024,
                    timeout,
                    signal: controller.signal,
                });
            };
            try {
                const res = await runMetadata(true);
                stdout = res.stdout;
            }
            catch (error) {
                if (controller.signal.aborted || !isSkipDashCompatibilityError(error))
                    throw error;
                // Só repete sem a otimização do YouTube se o erro apontar incompatibilidade dessa opção.
                const res = await runMetadata(false);
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
        }
        finally {
            releaseSlot();
        }
    })();
    entry = {
        controller,
        promise: fetchPromise.finally(() => {
            entry.settled = true;
            if (inFlightFetches.get(normalizedUrl) === entry)
                inFlightFetches.delete(normalizedUrl);
        }),
        consumers: 0,
        settled: false,
    };
    inFlightFetches.set(normalizedUrl, entry);
    return subscribeToFetch(entry, signal);
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
