import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { cleanPortableReleases } from '../clean-portable-releases.mjs';

const oldName = 'yt-dlp-GUI-Portable-1.1.0.exe';
const currentName = 'yt-dlp-GUI-Portable-1.2.0.exe';
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ytdlp-clean-release-'));
  t.after(() => {
    assert.equal(path.dirname(root), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('ytdlp-clean-release-'));
    fs.rmSync(root, { recursive: true, force: true });
  });
  fs.mkdirSync(path.join(root, 'desktop'));
  fs.mkdirSync(path.join(root, 'release'));
  fs.writeFileSync(path.join(root, 'desktop/package.json'), JSON.stringify({ name: 'yt-dlp-ui-desktop', version: '1.2.0' }));
  fs.writeFileSync(path.join(root, 'release', oldName), 'MZprevious portable');
  return root;
}

test('cleanup keeps the current Portable and unrelated files, removing only other versioned Portables', t => {
  const root = fixture(t), release = path.join(root, 'release');
  fs.writeFileSync(path.join(release, currentName), 'MZcurrent portable');
  fs.writeFileSync(path.join(release, 'yt-dlp-GUI-Portable-1.0.0.exe'), 'MZolder portable');
  for (const name of ['ffmpeg.exe', 'builder-debug.yml', 'notes.txt', 'yt-dlp-GUI-Portable-1.1.0-optimized.exe']) fs.writeFileSync(path.join(release, name), 'unrelated');
  fs.mkdirSync(path.join(release, 'win-unpacked'));
  fs.writeFileSync(path.join(release, 'win-unpacked', oldName), 'nested file');
  fs.mkdirSync(path.join(release, 'yt-dlp-GUI-Portable-0.1.0.exe'));
  assert.deepEqual(cleanPortableReleases(root).sort(), ['yt-dlp-GUI-Portable-1.0.0.exe', oldName]);
  assert.equal(fs.readFileSync(path.join(release, currentName), 'utf8'), 'MZcurrent portable');
  assert.ok(fs.existsSync(path.join(release, 'ffmpeg.exe')));
  assert.ok(fs.existsSync(path.join(release, 'builder-debug.yml')));
  assert.ok(fs.existsSync(path.join(release, 'notes.txt')));
  assert.ok(fs.existsSync(path.join(release, 'yt-dlp-GUI-Portable-1.1.0-optimized.exe')));
  assert.ok(fs.existsSync(path.join(release, 'win-unpacked', oldName)));
  assert.ok(fs.statSync(path.join(release, 'yt-dlp-GUI-Portable-0.1.0.exe')).isDirectory());
  assert.deepEqual(cleanPortableReleases(root), []);
});

test('missing, empty or invalid current Portable preserves the previous version', t => {
  for (const contents of [null, '', 'invalid executable']) {
    const root = fixture(t);
    if (contents !== null) fs.writeFileSync(path.join(root, 'release', currentName), contents);
    assert.throws(() => cleanPortableReleases(root));
    assert.equal(fs.readFileSync(path.join(root, 'release', oldName), 'utf8'), 'MZprevious portable');
  }
});

test('a release junction outside the project cannot be cleaned', t => {
  const root = fixture(t), external = fs.mkdtempSync(path.join(os.tmpdir(), 'ytdlp-clean-release-'));
  t.after(() => {
    assert.equal(path.dirname(external), path.resolve(os.tmpdir()));
    assert.ok(path.basename(external).startsWith('ytdlp-clean-release-'));
    fs.rmSync(external, { recursive: true, force: true });
  });
  const release = path.join(root, 'release');
  fs.unlinkSync(path.join(release, oldName)); fs.rmdirSync(release);
  fs.writeFileSync(path.join(external, oldName), 'MZexternal previous portable');
  fs.writeFileSync(path.join(external, currentName), 'MZexternal current portable');
  fs.symlinkSync(external, release, process.platform === 'win32' ? 'junction' : 'dir');
  assert.throws(() => cleanPortableReleases(root), /diretório real/);
  assert.ok(fs.existsSync(path.join(external, oldName)));
  fs.unlinkSync(release);
});
