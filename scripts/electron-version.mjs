import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createInterface } from 'node:readline/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Stable SemVer; Windows executable version fields are unsigned 16-bit integers.
export function isDesktopVersion(value) {
  return typeof value === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value)
    && value.split('.').every(part => Number(part) <= 65535);
}

function readManifests(root, io) {
  const filenames = ['package.json', 'package-lock.json'].map(name => path.join(root, 'desktop', name));
  const records = filenames.map(filename => {
    const original = io.readFileSync(filename, 'utf8');
    const data = JSON.parse(original);
    if (!data || data.name !== 'yt-dlp-ui-desktop' || !isDesktopVersion(data.version)) {
      throw new Error(`Manifesto desktop inválido: ${filename}`);
    }
    return { filename, original, data };
  });
  const [manifest, lock] = records;
  if (lock.data.lockfileVersion !== 3 || lock.data.packages?.['']?.name !== manifest.data.name
    || lock.data.version !== manifest.data.version || lock.data.packages[''].version !== manifest.data.version) {
    throw new Error('Versões do pacote desktop e lockfile estão inconsistentes. Corrija antes de distribuir.');
  }
  return records;
}

export function updateDesktopVersion(root, version, io = fs) {
  if (!isDesktopVersion(version)) throw new Error('Use MAJOR.MINOR.PATCH estável, com cada número entre 0 e 65535.');
  const records = readManifests(root, io);
  if (records[0].data.version === version) return false;
  for (const record of records) {
    record.data.version = version;
    if (record.data.packages) record.data.packages[''].version = version;
    const newline = record.original.includes('\r\n') ? '\r\n' : '\n';
    record.next = `${JSON.stringify(record.data, null, 2)}\n`.replace(/\n/g, newline);
    record.temporary = `${record.filename}.${crypto.randomUUID()}.tmp`;
  }
  const changed = [];
  try {
    // Prepare both files before replacing either original.
    for (const record of records) io.writeFileSync(record.temporary, record.next, { encoding: 'utf8', flag: 'wx' });
    for (const record of records) {
      io.renameSync(record.temporary, record.filename);
      changed.push(record);
    }
  } catch (error) {
    const failures = [error];
    for (const record of changed.reverse()) {
      try {
        io.writeFileSync(record.temporary, record.original, { encoding: 'utf8' });
        io.renameSync(record.temporary, record.filename);
      } catch (restoreError) { failures.push(restoreError); }
    }
    if (failures.length > 1) throw new AggregateError(failures, 'Falha de atualização e restauração; confira os manifests desktop antes de distribuir.');
    throw error;
  } finally {
    for (const record of records) io.rmSync(record.temporary, { force: true });
  }
  return true;
}

export class VersionPromptCancelled extends Error {
  constructor() { super('Versionamento cancelado; distribuição interrompida.'); }
}

export async function chooseDesktopVersion(current, question, log) {
  for (;;) {
    const answer = (await question('Deseja alterar a versão? (y/N) ')).trim().toLowerCase();
    if (answer === '' || answer === 'n') return current;
    if (answer === 'y') break;
    log('Responda y para alterar ou n/Enter para manter.');
  }
  for (;;) {
    const version = (await question('Nova versão: ')).trim();
    if (isDesktopVersion(version)) return version;
    log('Versão inválida. Use MAJOR.MINOR.PATCH, por exemplo 1.2.0 (números de 0 a 65535).');
  }
}

export async function runVersionPrompt({ root = projectRoot, input = process.stdin, output = process.stdout, env = process.env, io = fs } = {}) {
  const current = readManifests(root, io)[0].data.version;
  const log = message => output.write(`${message}\n`);
  log(`Versão atual do Electron: ${current}`);
  const ci = env.CI && !['0', 'false'].includes(String(env.CI).toLowerCase());
  if (ci || !input.isTTY || !output.isTTY) {
    log(`Execução sem interação ou em CI: mantendo a versão ${current}.`);
    return current;
  }
  const terminal = createInterface({ input, output, terminal: true });
  const controller = new AbortController();
  const cancel = () => controller.abort();
  terminal.on('SIGINT', cancel);
  terminal.on('close', cancel);
  try {
    const version = await chooseDesktopVersion(current, text => terminal.question(text, { signal: controller.signal }), log);
    const changed = updateDesktopVersion(root, version, io);
    log(changed ? `Versão do Electron atualizada para ${version}.` : `Mantendo a versão ${current}.`);
    return version;
  } catch (error) {
    if (controller.signal.aborted) throw new VersionPromptCancelled();
    throw error;
  } finally {
    terminal.off('SIGINT', cancel);
    terminal.off('close', cancel);
    terminal.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  runVersionPrompt().catch(error => {
    console.error(error.message);
    process.exitCode = error instanceof VersionPromptCancelled ? 130 : 1;
  });
}
