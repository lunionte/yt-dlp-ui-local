import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDesktopVersion } from './electron-version.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const portablePattern = /^yt-dlp-GUI-Portable-(\d+\.\d+\.\d+)\.exe$/;

/** Called only after electron-builder succeeds; never remove previous releases before that. */
export function cleanPortableReleases(root = projectRoot) {
  const realRoot = fs.realpathSync(root);
  const manifest = JSON.parse(fs.readFileSync(path.join(realRoot, 'desktop/package.json'), 'utf8'));
  if (manifest?.name !== 'yt-dlp-ui-desktop' || !isDesktopVersion(manifest.version)) {
    throw new Error('Versão desktop inválida; limpeza interrompida.');
  }
  const release = path.join(realRoot, 'release');
  const releaseStat = fs.lstatSync(release);
  if (!releaseStat.isDirectory() || releaseStat.isSymbolicLink() || fs.realpathSync(release) !== release) {
    throw new Error('A pasta release deve ser um diretório real dentro do projeto.');
  }
  const currentName = `yt-dlp-GUI-Portable-${manifest.version}.exe`;
  const current = path.join(release, currentName);
  const currentStat = fs.lstatSync(current);
  if (!currentStat.isFile() || currentStat.isSymbolicLink() || currentStat.size < 2) {
    throw new Error('Portable atual ausente ou inválido; versões anteriores preservadas.');
  }
  const file = fs.openSync(current, 'r');
  try {
    const header = Buffer.alloc(2);
    if (fs.readSync(file, header, 0, 2, 0) !== 2 || header.toString('ascii') !== 'MZ') {
      throw new Error('Portable atual não é um executável Windows; versões anteriores preservadas.');
    }
  } finally { fs.closeSync(file); }

  const removed = [];
  for (const entry of fs.readdirSync(release, { withFileTypes: true })) {
    const match = portablePattern.exec(entry.name);
    if (!match || !isDesktopVersion(match[1]) || entry.name === currentName || !entry.isFile()) continue;
    const target = path.resolve(release, entry.name);
    if (path.dirname(target) !== release) throw new Error('Artefato fora da pasta release.');
    // Recheck file kind before unlinking; symlinks and directories are never targets.
    const stat = fs.lstatSync(target);
    if (!stat.isFile() || stat.isSymbolicLink()) continue;
    fs.unlinkSync(target);
    removed.push(entry.name);
  }
  return removed;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const removed = cleanPortableReleases();
    for (const filename of removed) console.log(`Portable anterior removido: ${filename}`);
    if (!removed.length) console.log('Nenhuma versão anterior do Portable para remover.');
  } catch (error) {
    console.error(`Falha na limpeza das versões Portable: ${error.message}`);
    process.exitCode = 1;
  }
}
