import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { z } from 'zod';
import { normalizeFileStem, normalizeMediaUrl, VideoMetadataSchema } from '@ytdlp/shared';
import { loadConfig, verifyBinaryIntegrity } from '../config/paths.js';
import { executeBuffered } from './runner.service.js';
import { classifyFailure, OperationError, redactDiagnostic } from './error.service.js';
import { requireCookieFile } from './path.service.js';
import { PROGRESS_PREFIX } from './parser.service.js';
const entrySchema = z.object({
    id: z.union([z.string(), z.number()]).optional(), title: z.string().nullish(), thumbnail: z.string().nullish(),
    duration: z.number().finite().nonnegative().nullish(), duration_string: z.string().nullish(), uploader: z.string().nullish(),
    channel: z.string().nullish(), description: z.string().nullish(), extractor_key: z.string().nullish(), extractor: z.string().nullish(),
    formats: z.array(z.object({ height: z.number().finite().nonnegative().nullish(), width: z.number().finite().nonnegative().nullish(), vcodec: z.string().nullish(), acodec: z.string().nullish(), protocol: z.string().nullish(), aspect_ratio: z.number().finite().nonnegative().nullish() }).passthrough()).nullish(),
}).passthrough();
const extractionSchema = entrySchema.extend({ _type: z.string().optional(), entries: z.array(entrySchema.nullable()).max(100, 'A coleção excede o limite de 100 mídias').nullish() });
export function parseMetadata(stdout, url, stderr = '') {
    let raw;
    try {
        raw = JSON.parse(stdout);
    }
    catch {
        throw new OperationError('EXTRACTOR_ERROR', 'metadata', 'JSON inválido retornado pelo yt-dlp', 502);
    }
    const parsed = extractionSchema.safeParse(raw);
    if (!parsed.success)
        throw new OperationError('EXTRACTOR_ERROR', 'metadata', 'Estrutura de metadados inválida ou coleção acima de 100 entradas', 502);
    const data = parsed.data;
    const mapEntry = (item) => ({
        id: String(item.id ?? 'unknown'), title: (item.title || 'Sem título').slice(0, 500),
        thumbnail: item.thumbnail || undefined, duration: item.duration ?? undefined,
        durationString: item.duration_string || undefined, uploader: item.uploader || item.channel || undefined,
        description: item.description?.slice(0, 300) || undefined, extractor: item.extractor_key || item.extractor || undefined,
        availableResolutions: [...new Set((item.formats || []).filter(f => f.vcodec && !['none', 'images'].includes(f.vcodec) && f.protocol !== 'mhtml').flatMap(f => {
                // Width alone cannot pass the conservative height selector when orientation is unknown.
                if (!f.height || f.height <= 0)
                    return [];
                if ((!f.width || f.width <= 0) && f.aspect_ratio != null && f.aspect_ratio < 1)
                    return [];
                if (f.acodec === 'none' && !(item.formats || []).some(audio => audio.vcodec === 'none' && audio.acodec && audio.acodec !== 'none'))
                    return [];
                const resolution = f.width && f.width > 0 ? Math.min(f.width, f.height) : f.height;
                return Number.isInteger(resolution) ? [`${resolution}p`] : [];
            }))].sort((a, b) => parseInt(b) - parseInt(a)),
    });
    const collection = data._type === 'playlist' || !!data.entries;
    if (!collection && data.id === undefined)
        throw new OperationError('EXTRACTOR_ERROR', 'metadata', 'Vídeo sem identificador válido', 502);
    const entries = collection ? (data.entries || []).filter((e) => e !== null).map(mapEntry) : [];
    if (collection && !entries.length)
        throw new OperationError('UNAVAILABLE', 'metadata', 'Coleção sem mídia acessível', 502);
    const root = mapEntry(data);
    return VideoMetadataSchema.parse({
        ...root, url, kind: collection ? 'collection' : 'video', entries,
        thumbnail: root.thumbnail || entries[0]?.thumbnail,
        availableResolutions: collection ? [...new Set(entries.flatMap(e => e.availableResolutions))].sort((a, b) => parseInt(b) - parseInt(a)) : root.availableResolutions,
        warnings: stderr.split(/\r?\n/).filter(line => /warning:/i.test(line)).slice(-20).map(redactDiagnostic),
    });
}
export function buildAccessArgs(auth) {
    if (auth.mode === 'browser')
        return ['--cookies-from-browser', auth.browser];
    if (auth.mode === 'file')
        return ['--cookies', auth.cookiesFile];
    return [];
}
export function buildMetadataArgs(url, auth) {
    return ['--ignore-config', '--no-cache-dir', '--dump-single-json', '--no-playlist', '--skip-download', '--socket-timeout', '10', ...buildAccessArgs(auth), '--', normalizeMediaUrl(url)];
}
export async function validateAuthContext(auth) {
    return auth.mode === 'file' ? { ...auth, cookiesFile: await requireCookieFile(auth.cookiesFile) } : auth;
}
async function cacheKey(url, auth) {
    // The cache stores only an opaque digest, never cookie data.
    let fileVersion = '';
    if (auth.mode === 'file') {
        const stat = await fs.stat(auth.cookiesFile);
        fileVersion = `${stat.mtimeMs}:${stat.size}`;
    }
    return crypto.createHash('sha256').update(JSON.stringify([url, auth, fileVersion])).digest('hex');
}
const cache = new Map();
const pending = new Map();
const waiting = [];
let active = 0, stopping = false;
function abortError() { return Object.assign(new Error('Consulta cancelada'), { name: 'AbortError' }); }
function acquire(signal) {
    if (signal.aborted)
        return Promise.reject(abortError());
    if (waiting.length >= 20)
        return Promise.reject(new OperationError('CAPACITY', 'metadata', 'Limite de espera de metadados', 503));
    return new Promise((resolve, reject) => {
        const release = () => {
            active--;
            const next = waiting.shift();
            if (next) {
                next.signal.removeEventListener('abort', next.abort);
                next.start();
            }
        };
        const start = () => { active++; resolve(release); };
        const abort = () => { const index = waiting.findIndex(w => w.abort === abort); if (index >= 0)
            waiting.splice(index, 1); reject(abortError()); };
        if (active < 2)
            start();
        else {
            signal.addEventListener('abort', abort, { once: true });
            waiting.push({ start, reject, signal, abort });
        }
    });
}
function subscribe(entry, signal) {
    if (signal?.aborted)
        return Promise.reject(abortError());
    entry.consumers++;
    return new Promise((resolve, reject) => {
        let finished = false;
        const finish = (callback) => {
            if (finished)
                return;
            finished = true;
            signal?.removeEventListener('abort', abort);
            entry.consumers--;
            if (!entry.settled && !entry.consumers)
                entry.controller.abort();
            callback();
        };
        const abort = () => finish(() => reject(abortError()));
        signal?.addEventListener('abort', abort, { once: true });
        entry.promise.then(value => finish(() => resolve(structuredClone(value))), error => finish(() => reject(error)));
        if (signal?.aborted)
            abort();
    });
}
export async function fetchVideoInfo(rawUrl, signal, auth = { mode: 'none' }) {
    if (stopping)
        throw new OperationError('SHUTTING_DOWN', 'metadata', '', 503);
    if (signal?.aborted)
        throw abortError();
    auth = await validateAuthContext(auth);
    const url = normalizeMediaUrl(rawUrl);
    const key = await cacheKey(url, auth);
    if (stopping)
        throw new OperationError('SHUTTING_DOWN', 'metadata', '', 503);
    // Browser cookies can change between invocations; do not cache authenticated browser results.
    const cached = auth.mode !== 'browser' ? cache.get(key) : undefined;
    if (cached && cached.expires > Date.now())
        return structuredClone(cached.data);
    const existing = pending.get(key);
    if (existing && !existing.controller.signal.aborted)
        return subscribe(existing, signal);
    if (pending.size >= 22)
        throw new OperationError('CAPACITY', 'metadata', '', 503);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45000);
    const startedAt = Date.now();
    let entry;
    const promise = (async () => {
        let executionContext = {};
        const release = await acquire(controller.signal).catch(error => { if (Date.now() - startedAt >= 44500)
            throw new OperationError('TIMEOUT', 'metadata', 'Prazo total da consulta excedido na espera', 504); throw error; });
        try {
            const config = loadConfig();
            executionContext = await verifyBinaryIntegrity('yt-dlp');
            const result = await executeBuffered({ binaryPath: config.ytdlpPath, args: buildMetadataArgs(url, auth), signal: controller.signal, timeoutMs: Math.max(1, 45000 - (Date.now() - startedAt)), maxBuffer: 20 * 1024 * 1024 });
            const metadata = parseMetadata(result.stdout, url, result.stderr);
            if (auth.mode !== 'browser') {
                cache.set(key, { data: metadata, expires: Date.now() + 15 * 60 * 1000 });
                if (cache.size > 100)
                    cache.delete(cache.keys().next().value);
            }
            return metadata;
        }
        catch (error) {
            if (controller.signal.aborted) {
                if (Date.now() - startedAt >= 44500)
                    throw new OperationError('TIMEOUT', 'metadata', 'Prazo total da consulta excedido', 504);
                throw abortError();
            }
            throw classifyFailure(error, 'metadata', { ...executionContext, authMode: auth.mode, durationMs: Date.now() - startedAt });
        }
        finally {
            release();
        }
    })();
    entry = { controller, consumers: 0, settled: false, promise: promise.finally(() => { clearTimeout(timer); entry.settled = true; if (pending.get(key) === entry)
            pending.delete(key); }) };
    pending.set(key, entry);
    void entry.promise.catch(() => { });
    return subscribe(entry, signal);
}
export async function shutdownMetadata() {
    stopping = true;
    const entries = [...pending.values()];
    for (const entry of entries)
        entry.controller.abort();
    await Promise.allSettled(entries.map(e => e.promise));
    cache.clear();
}
export function buildVideoFormatSelector(resolution) {
    if (resolution === 'best')
        return 'bestvideo+bestaudio/best';
    const limit = parseInt(resolution, 10);
    // yt-dlp derives aspect_ratio from the format's dimensions before selection.
    // Unknown orientation retains the conservative height filter; unknown dimensions are rejected.
    const landscape = `[height<=${limit}][aspect_ratio>=?1]`;
    const portrait = `[width<=${limit}][aspect_ratio<1]`;
    return `(bestvideo${landscape}/bestvideo${portrait})+bestaudio/best${landscape}/best${portrait}`;
}
export function buildYtdlpArgs(options, context) {
    const { config, auth, jobId, outputFolder } = context;
    const args = ['--ignore-config', '--no-cache-dir', '--newline', '--no-simulate', '--progress', '--no-playlist', '--no-colors', '--windows-filenames', '--socket-timeout', '20', '--retries', '3', '--max-downloads', '100', ...buildAccessArgs(auth)];
    if (config.ffmpegPath)
        args.push('--ffmpeg-location', config.ffmpegPath);
    args.push('--progress-template', `download:${PROGRESS_PREFIX}%(progress._percent_str)s|%(progress._speed_str)s|%(progress._total_bytes_str|progress._total_bytes_estimate_str)s|%(progress._downloaded_bytes_str)s|%(progress._eta_str)s`);
    args.push('--progress-template', 'postprocess:__POSTPROCESS__%(progress.postprocessor)s|%(progress.status)s');
    args.push('--print', 'before_dl:__INFO__%(.{id,title,thumbnail,duration,extractor_key})j', '--print', 'after_move:__FILE__%(filepath)j');
    const name = options.customFilename ? normalizeFileStem(options.customFilename).replace(/%/g, '%%') : '%(title).80B';
    const workspace = context.workspace || path.join(outputFolder, `.ytdlp-${jobId}`);
    args.push('-o', path.join(workspace.replace(/%/g, '%%'), '%(autonumber)05d', `${name}.%(ext)s`));
    if (options.mode === 'audio') {
        args.push('-x', '--audio-format', options.audioFormat);
        if (options.audioQuality !== 'best')
            args.push('--audio-quality', options.audioQuality.replace(/k$/, 'K'));
    }
    else {
        args.push('-f', buildVideoFormatSelector(options.videoResolution), '--merge-output-format', options.videoContainer, '--remux-video', options.videoContainer);
    }
    if (options.embedThumbnail)
        args.push('--embed-thumbnail');
    if (options.embedSubtitles)
        args.push('--embed-subs', '--sub-langs', 'all,-live_chat');
    args.push('--', normalizeMediaUrl(options.url));
    return { args, outputFolder };
}
