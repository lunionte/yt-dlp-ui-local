import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface SystemConfig {
  ytdlpPath: string;
  ffmpegPath: string;
  ffprobePath: string;
  defaultDownloadDir: string;
  maxConcurrentDownloads: number;
  isEmbedded: boolean;
}

// Resolução da raiz do projeto:
// Se APP_ROOT estiver definido (Electron), usa-o; caso contrário resolve a partir deste arquivo (3 níveis acima)
const projectRoot = process.env.APP_ROOT || path.resolve(__dirname, '../../..');

// No Electron empacotado, config.json fica na pasta de dados do usuário (install dir é read-only)
// No modo web ou Electron dev, fica na raiz do projeto
const configFilePath = process.env.ELECTRON_USER_DATA
  ? path.resolve(process.env.ELECTRON_USER_DATA, 'config.json')
  : path.resolve(projectRoot, 'config.json');

const defaultDownloadDir = path.resolve(os.homedir(), 'Downloads');

/**
 * Localiza deterministamente os binários embutidos no próprio projeto / pacote
 */
export function getEmbeddedBinaryPath(name: string): string {
  const exeName = process.platform === 'win32' ? `${name}.exe` : name;

  // 1. Electron empacotado (extraResources em process.resourcesPath)
  if (process.env.ELECTRON && (process as any).resourcesPath) {
    const inResources = path.resolve((process as any).resourcesPath, exeName);
    if (fs.existsSync(inResources)) {
      return inResources;
    }
  }

  // 2. APP_ROOT definido pelo processo Electron ou ambiente
  if (process.env.APP_ROOT) {
    const inAppRoot = path.resolve(process.env.APP_ROOT, exeName);
    if (fs.existsSync(inAppRoot)) {
      return inAppRoot;
    }
  }

  // 3. Raiz do projeto (onde os executáveis oficiais do projeto residem)
  const inProjectRoot = path.resolve(projectRoot, exeName);
  if (fs.existsSync(inProjectRoot)) {
    return inProjectRoot;
  }

  // 4. CWD da aplicação
  const inCwd = path.resolve(process.cwd(), exeName);
  if (fs.existsSync(inCwd)) {
    return inCwd;
  }

  // 5. CWD pai (caso executado de dentro de backend/)
  const inParentCwd = path.resolve(process.cwd(), '..', exeName);
  if (fs.existsSync(inParentCwd)) {
    return inParentCwd;
  }

  // 6. Fallback (PATH global se os embutidos não forem encontrados por algum motivo)
  return exeName;
}

export function loadConfig(): SystemConfig {
  let userConfig: Partial<SystemConfig> = {};
  if (fs.existsSync(configFilePath)) {
    try {
      userConfig = JSON.parse(fs.readFileSync(configFilePath, 'utf-8'));
    } catch {
      // Ignora erro de parse e usa os padrões
    }
  }

  // Os executáveis são sempre os embutidos no projeto (não configuráveis pelo usuário)
  const ytdlpPath = getEmbeddedBinaryPath('yt-dlp');
  const ffmpegPath = getEmbeddedBinaryPath('ffmpeg');
  const ffprobePath = getEmbeddedBinaryPath('ffprobe');
  const downloadDir = userConfig.defaultDownloadDir && fs.existsSync(userConfig.defaultDownloadDir)
    ? userConfig.defaultDownloadDir
    : defaultDownloadDir;

  return {
    ytdlpPath,
    ffmpegPath,
    ffprobePath,
    defaultDownloadDir: downloadDir,
    maxConcurrentDownloads: userConfig.maxConcurrentDownloads ?? 2,
    isEmbedded: true,
  };
}

export function saveConfig(updates: Partial<SystemConfig>): SystemConfig {
  const current = loadConfig();
  // Apenas preferências de usuário são salvas em disco (caminhos dos binários são embutidos e imutáveis)
  const userPreferences = {
    defaultDownloadDir: updates.defaultDownloadDir && fs.existsSync(updates.defaultDownloadDir)
      ? updates.defaultDownloadDir
      : current.defaultDownloadDir,
    maxConcurrentDownloads: updates.maxConcurrentDownloads ?? current.maxConcurrentDownloads,
  };

  fs.writeFileSync(configFilePath, JSON.stringify(userPreferences, null, 2), 'utf-8');

  return {
    ...current,
    ...userPreferences,
  };
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
