import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { PassThrough } from 'node:stream';
import { chooseDesktopVersion, updateDesktopVersion, runVersionPrompt, VersionPromptCancelled } from '../electron-version.mjs';

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ytdlp-version-'));
  t.after(() => {
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('ytdlp-version-'));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  fs.mkdirSync(path.join(directory, 'desktop'));
  const packageFile = path.join(directory, 'desktop/package.json');
  const lockFile = path.join(directory, 'desktop/package-lock.json');
  const manifest = { name: 'yt-dlp-ui-desktop', version: '1.1.0', dependencies: { '@ytdlp/shared': 'file:../shared' } };
  const lock = { name: manifest.name, version: manifest.version, lockfileVersion: 3, packages: {
    '': { ...manifest }, '../shared': { version: '1.1.0' }, 'node_modules/zod': { version: '3.25.76', integrity: 'unchanged' },
  } };
  fs.writeFileSync(packageFile, JSON.stringify(manifest, null, 2) + '\n');
  fs.writeFileSync(lockFile, JSON.stringify(lock, null, 2) + '\n');
  fs.writeFileSync(path.join(directory, 'package.json'), '{"version":"1.1.0"}\n');
  return { directory, packageFile, lockFile };
}

test('version prompt defaults to current version and accepts explicit y with validated replacement', async () => {
  for (const answer of ['', 'n', ' N ']) {
    assert.equal(await chooseDesktopVersion('1.1.0', async () => answer, () => {}), '1.1.0');
  }
  const answers = ['maybe', ' Y ', 'v1.2.0', '01.2.0', '1.2.0-beta.1', '65536.0.0', '', ' 1.2.0 '];
  const messages = [];
  assert.equal(await chooseDesktopVersion('1.1.0', async () => answers.shift(), value => messages.push(value)), '1.2.0');
  assert.equal(messages.length, 6);
  assert.equal(await chooseDesktopVersion('1.1.0', async text => text.startsWith('Nova') ? '1.1.0' : 'y', () => {}), '1.1.0');
});

test('version changes update only desktop identities and preserve shared/dependency versions', t => {
  const { directory, packageFile, lockFile } = fixture(t);
  const originalLock = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
  const rootOriginal = fs.readFileSync(path.join(directory, 'package.json'), 'utf8');
  assert.equal(updateDesktopVersion(directory, '1.2.0'), true);
  assert.equal(JSON.parse(fs.readFileSync(packageFile, 'utf8')).version, '1.2.0');
  const changed = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
  assert.equal(changed.version, '1.2.0'); assert.equal(changed.packages[''].version, '1.2.0');
  changed.version = '1.1.0'; changed.packages[''].version = '1.1.0';
  assert.deepEqual(changed, originalLock);
  assert.equal(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'), rootOriginal);
  assert.equal(updateDesktopVersion(directory, '1.2.0'), false);
  assert.throws(() => updateDesktopVersion(directory, 'bad'), /MAJOR/);
});

test('failed preparation or replacement restores original manifests and removes temporary files', t => {
  for (const method of ['writeFileSync', 'renameSync']) {
    const { directory, packageFile, lockFile } = fixture(t);
    const originals = [packageFile, lockFile].map(filename => fs.readFileSync(filename, 'utf8'));
    let calls = 0;
    const io = { ...fs, [method]: (...args) => {
      if (++calls === 2) throw new Error('injected filesystem failure');
      return fs[method](...args);
    } };
    assert.throws(() => updateDesktopVersion(directory, '1.2.0', io), /injected filesystem failure/);
    assert.deepEqual([packageFile, lockFile].map(filename => fs.readFileSync(filename, 'utf8')), originals);
    assert.deepEqual(fs.readdirSync(path.join(directory, 'desktop')).sort(), ['package-lock.json', 'package.json']);
  }
});

test('non-interactive and CI executions keep manifests unchanged', async t => {
  const { directory, packageFile, lockFile } = fixture(t);
  const originals = [packageFile, lockFile].map(filename => fs.readFileSync(filename, 'utf8'));
  for (const ci of ['', 'true']) {
    const input = new PassThrough(), output = new PassThrough();
    input.isTTY = output.isTTY = !!ci;
    let text = ''; output.on('data', chunk => { text += chunk.toString(); });
    assert.equal(await runVersionPrompt({ root: directory, input, output, env: { CI: ci } }), '1.1.0');
    assert.ok(text.includes('mantendo a versão 1.1.0'));
    input.destroy(); output.destroy();
  }
  assert.deepEqual([packageFile, lockFile].map(filename => fs.readFileSync(filename, 'utf8')), originals);
});

test('actual readline interaction updates version and Ctrl+C or EOF interrupts without changing files', async t => {
  for (const action of ['update', 'interrupt', 'eof']) {
    const { directory, packageFile } = fixture(t);
    const input = new PassThrough(), output = new PassThrough();
    input.isTTY = output.isTTY = true;
    const answers = action === 'update' ? ['y\n', '1.2.0\n'] : [action === 'interrupt' ? '\x03' : null];
    let text = '', prompts = 0;
    output.on('data', chunk => {
      text += chunk.toString();
      const count = (text.match(/\(y\/N\)|Nova versão:/g) || []).length;
      if (count > prompts) {
        prompts = count;
        const answer = answers.shift();
        queueMicrotask(() => answer === null ? input.end() : input.write(answer));
      }
    });
    const result = runVersionPrompt({ root: directory, input, output, env: {} });
    if (action === 'update') assert.equal(await result, '1.2.0');
    else await assert.rejects(result, VersionPromptCancelled);
    assert.equal(JSON.parse(fs.readFileSync(packageFile, 'utf8')).version, action === 'update' ? '1.2.0' : '1.1.0');
    input.destroy(); output.destroy();
  }
});

test('inconsistent lock identity blocks distribution before any write', t => {
  const { directory, packageFile, lockFile } = fixture(t);
  const lock = JSON.parse(fs.readFileSync(lockFile, 'utf8')); lock.packages[''].version = '1.0.0';
  fs.writeFileSync(lockFile, JSON.stringify(lock));
  const original = fs.readFileSync(packageFile, 'utf8');
  assert.throws(() => updateDesktopVersion(directory, '1.2.0'), /inconsistentes/);
  assert.equal(fs.readFileSync(packageFile, 'utf8'), original);
});
