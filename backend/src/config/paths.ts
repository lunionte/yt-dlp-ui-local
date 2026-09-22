import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface SystemConfig {
  ytdlpPath: string;
  ffmpegPath: string;
  ffprobePath: string;
  defaultDownloadDir: string;
  maxConcurrentDownloads: number;
}

// O workspace raiz fica um nível acima da pasta backend se estivermos em backend/
// No Electron, APP_ROOT é definido pelo main process
const rootDir = process.env.APP_ROOT || path.resolve(process.cwd(), fs.existsSync(path.resolve(process.cwd(), 'yt-dlp.exe')) ? '.' : '..');

// No Electron empacotado, config.json fica na pasta de dados do usuário (install dir é read-only)
// No modo web ou Electron dev, fica na raiz do projeto
const configFilePath = process.env.ELECTRON_USER_DATA
  ? path.resolve(process.env.ELECTRON_USER_DATA, 'config.json')
  : path.resolve(rootDir, 'config.json');

const defaultDownloadDir = path.resolve(os.homedir(), 'Downloads');

function findBinary(name: string): string {
  const exeName = process.platform === 'win32' ? `${name}.exe` : name;

  // 0. Electron extraResources (app empacotado)
  if (process.env.ELECTRON && (process as any).resourcesPath) {
    const inResources = path.resolve((process as any).resourcesPath, exeName);
    if (fs.existsSync(inResources)) {
      return inResources;
    }
  }

  // 1. Procurar na raiz do projeto
  const inRoot = path.resolve(rootDir, exeName);
  if (fs.existsSync(inRoot)) {
    return inRoot;
  }

  // 2. Procurar no CWD
  const inCwd = path.resolve(process.cwd(), exeName);
  if (fs.existsSync(inCwd)) {
    return inCwd;
  }

  // 3. Fallback para comando global no PATH
  return name;
}

export function loadConfig(): SystemConfig {
  let config: Partial<SystemConfig> = {};
  if (fs.existsSync(configFilePath)) {
    try {
      config = JSON.parse(fs.readFileSync(configFilePath, 'utf-8'));
    } catch {
      // Ignora erro de parse e usa os padrões
    }
  }

  const ytdlpPath = config.ytdlpPath && fs.existsSync(config.ytdlpPath) ? config.ytdlpPath : findBinary('yt-dlp');
  const ffmpegPath = config.ffmpegPath && fs.existsSync(config.ffmpegPath) ? config.ffmpegPath : findBinary('ffmpeg');
  const ffprobePath = config.ffprobePath && fs.existsSync(config.ffprobePath) ? config.ffprobePath : findBinary('ffprobe');
  const downloadDir = config.defaultDownloadDir && fs.existsSync(config.defaultDownloadDir)
    ? config.defaultDownloadDir
    : defaultDownloadDir;

  return {
    ytdlpPath,
    ffmpegPath,
    ffprobePath,
    defaultDownloadDir: downloadDir,
    maxConcurrentDownloads: config.maxConcurrentDownloads ?? 2,
  };
}

export function saveConfig(updates: Partial<SystemConfig>): SystemConfig {
  const current = loadConfig();
  const merged: SystemConfig = {
    ...current,
    ...updates,
  };

  fs.writeFileSync(configFilePath, JSON.stringify(merged, null, 2), 'utf-8');
  return merged;
}

export async function checkToolVersion(toolPath: string, versionFlag = '--version'): Promise<{ available: boolean; version?: string; path: string; error?: string }> {
  try {
    const { stdout } = await execFileAsync(toolPath, [versionFlag], { timeout: 10000 });
    const firstLine = stdout.split('\n')[0].trim();
    return {
      available: true,
      version: firstLine,
      path: toolPath,
    };
  } catch (err: any) {
    return {
      available: false,
      path: toolPath,
      error: err.message || 'Ferramenta não encontrada ou com erro',
    };
  }
}
