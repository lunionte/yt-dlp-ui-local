import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifestPath = path.join(root, 'tools-lock.json');
const names = ['yt-dlp.exe', 'ffmpeg.exe'];
async function sha256(file) {
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
const record = process.argv.includes('--record');
const manifest = record ? { schemaVersion: 1, platform: 'win32-x64', tools: {} } : JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (manifest.schemaVersion !== 1 || manifest.platform !== 'win32-x64') throw new Error('Manifesto incompatível');
for (const name of names) {
  const file = path.join(root, name);
  const version = execFileSync(file, name === 'yt-dlp.exe' ? ['--ignore-config', '--version'] : ['-version'], { shell: false, windowsHide: true, timeout: 10000, encoding: 'utf8' }).split(/\r?\n/)[0].trim();
  const digest = await sha256(file);
  if (record) manifest.tools[name] = { version, sha256: digest, source: 'local-provided', upstream: name === 'yt-dlp.exe' ? 'https://github.com/yt-dlp/yt-dlp/releases' : 'https://ffmpeg.org/download.html' };
  else if (manifest.tools[name]?.sha256 !== digest || manifest.tools[name]?.version !== version) throw new Error(`${name}: versão/hash difere do manifesto. Verifique a origem antes de registrar uma atualização.`);
  console.log(`${name}: ${version}; SHA-256 ${digest}`);
}
if (record) fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
