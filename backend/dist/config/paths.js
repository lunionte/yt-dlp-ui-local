import path from 'node:path';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { UserPreferencesSchema, UpdateConfigSchema } from '@ytdlp/shared';
import { executeBuffered } from '../services/runner.service.js';
import { OperationError, classifyFailure } from '../services/error.service.js';
import { requireDirectory } from '../services/path.service.js';
const projectRoot = process.env.APP_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const resourcesPath = process.resourcesPath;
const configFilePath = path.resolve(process.env.ELECTRON_USER_DATA || projectRoot, 'config.json');
export function resolveBinary(name) {
    const file = process.platform === 'win32' ? `${name}.exe` : name;
    if (process.env.ELECTRON && resourcesPath) {
        const target = path.join(resourcesPath, file);
        if (fs.existsSync(target) && fs.statSync(target).isFile())
            return { path: target, source: 'resources', embedded: true };
    }
    const target = path.join(projectRoot, file);
    if (fs.existsSync(target) && fs.statSync(target).isFile())
        return { path: target, source: 'project', embedded: true };
    return { path: file, source: 'path', embedded: false };
}
export function getEmbeddedBinaryPath(name) { return resolveBinary(name).path; }
let preferences;
function readPreferences() {
    if (preferences)
        return preferences;
    const defaults = { defaultDownloadDir: path.join(os.homedir(), 'Downloads'), maxConcurrentDownloads: 2 };
    try {
        const loaded = UserPreferencesSchema.parse(JSON.parse(fs.readFileSync(configFilePath, 'utf8')));
        if (!path.isAbsolute(loaded.defaultDownloadDir) || !fs.statSync(loaded.defaultDownloadDir).isDirectory())
            throw new Error('Pasta de preferência inválida');
        preferences = loaded;
    }
    catch (error) {
        if (error.code !== 'ENOENT') {
            const failure = new OperationError('VALIDATION_ERROR', 'system', 'Configuração no disco inválida; padrões restaurados', 400);
            console.warn(`[config] ${failure.message} Diagnóstico: ${failure.details.diagnosticId}`);
        }
        preferences = defaults;
    }
    return preferences;
}
export function loadConfig() {
    const yt = resolveBinary('yt-dlp'), ffmpeg = resolveBinary('ffmpeg'), ffprobe = resolveBinary('ffprobe');
    return { ...readPreferences(), ytdlpPath: yt.path, ffmpegPath: ffmpeg.path, ffprobePath: ffprobe.path, isEmbedded: yt.embedded && ffmpeg.embedded };
}
let writeChain = Promise.resolve();
export function saveConfig(input) {
    const operation = writeChain.then(async () => {
        const parsed = UpdateConfigSchema.safeParse(input);
        if (!parsed.success)
            throw new OperationError('VALIDATION_ERROR', 'system', 'Preferências inválidas', 400);
        const next = { ...readPreferences(), ...parsed.data };
        await requireDirectory(next.defaultDownloadDir, true);
        const temporary = `${configFilePath}.${crypto.randomUUID()}.tmp`;
        try {
            await fsp.mkdir(path.dirname(configFilePath), { recursive: true });
            await fsp.writeFile(temporary, JSON.stringify(next, null, 2), { encoding: 'utf8', mode: 0o600 });
            await fsp.rename(temporary, configFilePath);
            preferences = next;
        }
        catch (error) {
            throw classifyFailure(error, 'system');
        }
        finally {
            await fsp.rm(temporary, { force: true }).catch(() => { });
        }
        return loadConfig();
    });
    writeChain = operation.catch(() => { });
    return operation;
}
const integrityCache = new Map();
async function checkIntegrity(location) {
    if (!location.embedded)
        return 'unverified';
    const manifestPath = location.source === 'resources' && resourcesPath ? path.join(resourcesPath, 'tools-lock.json') : path.join(projectRoot, 'tools-lock.json');
    try {
        const manifest = JSON.parse(await fsp.readFile(manifestPath, 'utf8'));
        const pin = manifest.tools?.[path.basename(location.path)];
        if (!pin || !/^[a-f0-9]{64}$/i.test(pin.sha256))
            return 'unverified';
        const stat = await fsp.stat(location.path);
        const cached = integrityCache.get(location.path);
        if (cached && cached.mtime === stat.mtimeMs && cached.size === stat.size)
            return cached.integrity;
        const hash = crypto.createHash('sha256');
        for await (const chunk of fs.createReadStream(location.path))
            hash.update(chunk);
        const integrity = hash.digest('hex') === pin.sha256 ? 'verified' : 'mismatch';
        integrityCache.set(location.path, { size: stat.size, mtime: stat.mtimeMs, integrity });
        return integrity;
    }
    catch {
        return 'unverified';
    }
}
export async function checkToolVersion(toolPath, versionFlag = '--version') {
    const name = path.basename(toolPath).replace(/\.exe$/i, '');
    const location = resolveBinary(name);
    const integrity = await checkIntegrity(location);
    try {
        if (integrity === 'mismatch')
            throw new OperationError('TOOL_UNAVAILABLE', 'system', 'Hash do binário difere do manifesto');
        const result = await executeBuffered({ binaryPath: toolPath, args: versionFlag === '--version' ? ['--ignore-config', versionFlag] : [versionFlag], timeoutMs: 10000, maxBuffer: 1024 * 1024 });
        return { ...location, available: true, version: result.stdout.split(/\r?\n/)[0].trim(), integrity };
    }
    catch (error) {
        return { ...location, available: false, error: classifyFailure(error, 'system').message, integrity };
    }
}
export async function verifyBinaryIntegrity(name) {
    const location = resolveBinary(name);
    const integrity = await checkIntegrity(location);
    if (integrity === 'mismatch')
        throw new OperationError('TOOL_UNAVAILABLE', 'system', 'Integridade do binário difere do manifesto', 502);
    let version = 'não registrada';
    try {
        const manifestPath = location.source === 'resources' && resourcesPath ? path.join(resourcesPath, 'tools-lock.json') : path.join(projectRoot, 'tools-lock.json');
        const manifest = JSON.parse(await fsp.readFile(manifestPath, 'utf8'));
        if (integrity === 'verified')
            version = manifest.tools?.[path.basename(location.path)]?.version || version;
    }
    catch { /* Unpinned tools remain explicitly unverified. */ }
    return { toolSource: location.source, toolVersion: version, integrity };
}
