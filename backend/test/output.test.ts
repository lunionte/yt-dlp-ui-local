import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { CreateDownloadSchema, normalizeFileStem } from '@ytdlp/shared';
import { createWorkspace, publishFile, removeWorkspace, requireWorkspaceFile } from '../src/services/output.service.js';
import { QueueService } from '../src/services/queue.service.js';
import type { ProcessResult } from '../src/services/runner.service.js';

async function temporary(run: (folder: string) => Promise<void>) {
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'ytdlp-output-test-'));
  try { await run(folder); }
  finally {
    assert.ok(path.isAbsolute(folder) && folder.startsWith(path.join(os.tmpdir(), 'ytdlp-output-test-')));
    await fs.rm(folder, { recursive: true, force: true });
  }
}
async function settled(queue: QueueService, id: string) {
  // shutdown also waits for the cleanup after terminal transitions; don't cancel a running job here.
  for (let index = 0; index < 400; index++) {
    if (['completed', 'error', 'cancelled'].includes(queue.getJob(id)!.status)) return queue.getJob(id)!;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error('Job não terminou');
}
test('public file stems preserve Unicode, escape Windows names and enforce a shared byte limit', () => {
  assert.equal(normalizeFileStem(' CON.txt 50% / vídeo 🎬. '), '_CON.txt 50% _ vídeo 🎬');
  assert.equal(normalizeFileStem('...'), 'Sem título');
  const name = normalizeFileStem('🎬'.repeat(80));
  assert.equal(new TextEncoder().encode(name).length, 80);
  assert.ok(!name.includes('\ufffd'));
});
test('exclusive publication handles concurrent collisions without overwriting existing files', async () => temporary(async folder => {
  await fs.writeFile(path.join(folder, 'Título.mp4'), 'existing');
  const sources = await Promise.all(['a', 'b', 'c'].map(async id => {
    const workspace = await createWorkspace(folder, id), source = path.join(workspace, 'tool.mp4');
    await fs.writeFile(source, id); return { workspace, source, id };
  }));
  const published = await Promise.all(sources.map(item => publishFile(item.source, folder, 'Título')));
  assert.deepEqual(published.map(file => path.basename(file)).sort(), ['Título (2).mp4', 'Título (3).mp4', 'Título (4).mp4']);
  assert.equal(await fs.readFile(path.join(folder, 'Título.mp4'), 'utf8'), 'existing');
  assert.deepEqual((await Promise.all(published.map(file => fs.readFile(file, 'utf8')))).sort(), ['a', 'b', 'c']);
  for (const item of sources) await removeWorkspace(item.workspace, folder, item.id);
  await assert.rejects(removeWorkspace(folder, folder, 'a'));
  assert.throws(() => requireWorkspaceFile(sources[0].workspace, path.join(folder, 'outside.mp4')));
}));

for (const mode of ['original', 'custom', 'partial', 'rejected', 'publication-failure'] as const) {
  test(`queue publishes real files with readable names: ${mode}`, async () => temporary(async folder => {
    let stagedFile = '';
    const title = 'Título original: vídeo 🎬';
    const custom = 'CON.txt 50% / novo';
    const queue = new QueueService({
      config: () => ({ ytdlpPath: 'mock', ffmpegPath: '', ffprobePath: '', defaultDownloadDir: folder, maxConcurrentDownloads: 1, isEmbedded: false }),
      prepareDirectory: async value => value, validateAuth: async value => value,
      verifyFile: async file => { assert.ok((await fs.stat(file)).isFile()); },
      ...(mode === 'publication-failure' ? { publishFile: async () => { throw Object.assign(new Error('Permission denied'), { code: 'EACCES' }); } } : {}),
      run: options => ({ pid: undefined, kill: async () => {}, promise: (async (): Promise<ProcessResult> => {
        const template = options.args[options.args.indexOf('-o') + 1];
        stagedFile = path.join(path.dirname(path.dirname(template)), '00001', 'tool.mp4');
        await fs.mkdir(path.dirname(stagedFile)); await fs.writeFile(stagedFile, 'complete-media');
        options.onStdoutLine!('__INFO__' + JSON.stringify({ id: 'one', title }));
        options.onStdoutLine!('__FILE__' + JSON.stringify(stagedFile));
        assert.deepEqual(queue.getJobs()[0].outputFiles, []);
        if (mode === 'rejected') throw new Error('Network timeout after the first file');
        return { exitCode: mode === 'partial' ? 1 : 0, signal: null, stdout: '', stderr: 'Later entry failed' };
      })() }),
    });
    const job = await queue.addJob(CreateDownloadSchema.parse({ url: 'https://example.com/v', customFilename: mode === 'custom' ? custom : undefined }));
    const final = await settled(queue, job.id); await queue.shutdown();
    if (mode === 'publication-failure') {
      assert.equal(final.status, 'error'); assert.equal(final.errorDetails?.code, 'FILESYSTEM_ERROR');
      assert.deepEqual(final.outputFiles, []); assert.equal(await fs.readFile(stagedFile, 'utf8'), 'complete-media');
    } else {
      assert.equal(final.status, ['partial', 'rejected'].includes(mode) ? 'error' : 'completed');
      assert.equal(path.basename(final.outputFiles[0]), normalizeFileStem(mode === 'custom' ? custom : title) + '.mp4');
      assert.equal(await fs.readFile(final.outputFiles[0], 'utf8'), 'complete-media');
      assert.ok(!(await fs.readdir(folder)).some(name => name.startsWith('.ytdlp-')));
    }
  }));
}

test('cancellation waits for close, publishes completed media and removes only owned partials', async () => temporary(async folder => {
  let close!: (result: ProcessResult) => void, ready!: () => void, stagedFile = '';
  const closed = new Promise<ProcessResult>(resolve => { close = resolve; });
  const started = new Promise<void>(resolve => { ready = resolve; });
  const queue = new QueueService({
    config: () => ({ ytdlpPath: 'mock', ffmpegPath: '', ffprobePath: '', defaultDownloadDir: folder, maxConcurrentDownloads: 1, isEmbedded: false }),
    prepareDirectory: async value => value, validateAuth: async value => value,
    verifyFile: async file => { assert.ok((await fs.stat(file)).isFile()); },
    run: options => ({ pid: undefined, kill: async () => { await closed; }, promise: (async () => {
      const template = options.args[options.args.indexOf('-o') + 1];
      stagedFile = path.join(path.dirname(path.dirname(template)), '00001', 'complete.mp4');
      await fs.mkdir(path.dirname(stagedFile));
      await fs.writeFile(stagedFile, 'complete'); await fs.writeFile(path.join(path.dirname(stagedFile), 'unfinished.part'), 'partial');
      options.onStdoutLine!('__INFO__' + JSON.stringify({ id: 'one', title: 'Mídia completa' }));
      options.onStdoutLine!('__FILE__' + JSON.stringify(stagedFile));
      ready(); return closed;
    })() }),
  });
  const job = await queue.addJob(CreateDownloadSchema.parse({ url: 'https://example.com/v' }));
  await started;
  const cancellation = queue.cancelJob(job.id);
  assert.equal(queue.getJob(job.id)!.status, 'cancelling');
  assert.deepEqual(queue.getJob(job.id)!.outputFiles, []);
  assert.equal(await fs.readFile(stagedFile, 'utf8'), 'complete');
  close({ exitCode: 1, signal: null, stdout: '', stderr: '' });
  await cancellation; await queue.shutdown();
  const final = queue.getJob(job.id)!;
  assert.equal(final.status, 'cancelled');
  assert.deepEqual(final.outputFiles.map(file => path.basename(file)), ['Mídia completa.mp4']);
  assert.ok(!(await fs.readdir(folder)).some(name => name.startsWith('.ytdlp-')));
}));
