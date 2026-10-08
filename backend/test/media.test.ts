import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { CreateDownloadSchema, normalizeMediaUrl, isYoutubeUrl, AuthContextSchema } from '@ytdlp/shared';
import { classifyFailure, OperationError, getDiagnostic, redactDiagnostic } from '../src/services/error.service.js';
import { buildYtdlpArgs, buildMetadataArgs, parseMetadata } from '../src/services/ytdlp.service.js';
import { parseProgressLine } from '../src/services/parser.service.js';
import { buildUnixDialogCommands } from '../src/services/dialog.service.js';
import { requireDirectory, requireCookieFile } from '../src/services/path.service.js';

const config = { ytdlpPath: 'yt-dlp', ffmpegPath: 'ffmpeg', ffprobePath: 'ffprobe', defaultDownloadDir: os.tmpdir(), maxConcurrentDownloads: 2, isEmbedded: false };
test('different social failures keep distinct classifications; a long unknown error is not privacy', () => {
  const cases = [
    ['Instagram login required', 'AUTH_REQUIRED'], ['HTTP Error 429: Too Many Requests', 'RATE_LIMITED'],
    ['Requested format is not available', 'FORMAT_UNAVAILABLE'], ['Unable to extract Instagram LSD token', 'EXTRACTOR_ERROR'],
    ['HTTP Error 403: Forbidden', 'ACCESS_DENIED'], ['getaddrinfo ENOTFOUND', 'NETWORK_ERROR'],
    ['Unable to download webpage: HTTP Error 403: Forbidden', 'ACCESS_DENIED'],
    ['Unable to download webpage: HTTP Error 429: Too Many Requests', 'RATE_LIMITED'],
    ['Unable to download webpage: HTTP Error 404: Not Found', 'UNAVAILABLE'],
    ['A'.repeat(200), 'UNKNOWN'],
  ];
  for (const [message, code] of cases) assert.equal(classifyFailure(new Error(message), 'metadata').details.code, code);
});
test('diagnostics redact authorization, signed URLs and local cookie paths', () => {
  const failure = new OperationError('AUTH_REQUIRED', 'metadata', 'Authorization: Bearer SECRET\nCookie: sessionid=SECRET\nhttps://user:pass@example.com/v?token=SECRET\n--cookies C:\\private\\cookies.txt');
  const diagnostic = JSON.stringify(getDiagnostic(failure.details.diagnosticId));
  assert.ok(!diagnostic.includes('SECRET') && !diagnostic.includes('user:pass') && !diagnostic.includes('private'));
  assert.ok(redactDiagnostic('ERROR: Unable to extract token').includes('Unable to extract'));
});
test('collection metadata preserves children and warns; malformed JSON is rejected', () => {
  const result = parseMetadata(JSON.stringify({ _type: 'playlist', id: 'post', title: 'Post', entries: [
    { id:'a', title:'A', thumbnail:'https://example.com/a', duration:15, formats:[{height:1080,vcodec:'h264'}] },
    { id:'b', title:'B', formats:[{height:720,vcodec:'h264'}] },
  ] }), 'https://instagram.com/p/example/', 'WARNING: fallback extractor');
  assert.equal(result.kind, 'collection'); assert.equal(result.entries.length, 2);
  assert.deepEqual(result.availableResolutions, ['1080p','720p']); assert.equal(result.entries[0].duration, 15);
  assert.equal(result.warnings.length, 1);
  assert.throws(() => parseMetadata('{} broken', result.url), OperationError);
  assert.throws(() => parseMetadata(JSON.stringify({ formats: [{height:'bad'}] }), result.url), OperationError);
});
test('preview and download share explicit auth, isolate config and terminate options before URL', () => {
  for (const auth of [AuthContextSchema.parse({mode:'none'}), AuthContextSchema.parse({mode:'browser',browser:'firefox'}), AuthContextSchema.parse({mode:'file',cookiesFile:path.join(os.tmpdir(),'cookies.txt')})]) {
    const options = CreateDownloadSchema.parse({url:'https://instagram.com/p/example/', auth});
    const preview = buildMetadataArgs(options.url, auth);
    const download = buildYtdlpArgs(options, {config,auth,jobId:'job-a',outputFolder:os.tmpdir()}).args;
    for (const args of [preview,download]) {
      assert.ok(args.includes('--ignore-config')); assert.equal(args.at(-2),'--');
      assert.equal(args.includes('--cookies-from-browser'), auth.mode==='browser');
      assert.equal(args.includes('--cookies'), auth.mode==='file');
    }
  }
});
test('format ceiling applies to every fallback; remux and unique multi-media filenames are explicit', () => {
  const options = CreateDownloadSchema.parse({url:'https://x.com/author/status/123', customFilename:'CON.txt 50%', videoResolution:'720p'});
  const one = buildYtdlpArgs(options,{config,auth:{mode:'none'},jobId:'one',outputFolder:os.tmpdir()}).args;
  const two = buildYtdlpArgs(options,{config,auth:{mode:'none'},jobId:'two',outputFolder:os.tmpdir()}).args;
  assert.equal(one[one.indexOf('-f')+1], '(bestvideo[height<=720][aspect_ratio>=?1]/bestvideo[width<=720][aspect_ratio<1])+bestaudio/best[height<=720][aspect_ratio>=?1]/best[width<=720][aspect_ratio<1]');
  assert.equal(one[one.indexOf('--remux-video')+1], 'mp4');
  const filename = one[one.indexOf('-o')+1];
  assert.ok(filename.includes('_CON.txt 50%%') && filename.includes('.ytdlp-one') && filename.includes('%(autonumber)05d'));
  assert.notEqual(filename,two[two.indexOf('-o')+1]);
});
test('portrait and landscape metadata use the shortest dimension, without inventing unknown resolutions', () => {
  const metadata = parseMetadata(JSON.stringify({ id: 'reel', formats: [
    { width: 1080, height: 1920, vcodec: 'vp9' },
    { width: 720, height: 1280, vcodec: 'vp9' },
    { width: 1920, height: 1080, vcodec: 'h264' },
    { height: 480, vcodec: 'h264' },
    { width: 4000, vcodec: 'h264' },
    { height: 2160, vcodec: 'images', protocol: 'mhtml' },
    { height: 1440, width: 2560, vcodec: 'h264', acodec: 'none' },
    { width: null, height: null, vcodec: 'unknown' },
    { height: 0, vcodec: 'none' },
  ] }), 'https://instagram.com/reels/example/');
  assert.deepEqual(metadata.availableResolutions, ['1080p', '720p', '480p']);
});
test('hostname parsing avoids query and suffix false positives; unrelated parameters survive', () => {
  assert.equal(isYoutubeUrl('https://example.com/video?ref=youtube.com'),false);
  assert.equal(isYoutubeUrl('https://youtube.com.evil.example/video'),false);
  assert.ok(normalizeMediaUrl('https://example.com/video?si=functional').includes('si=functional'));
  assert.equal(normalizeMediaUrl('https://youtu.be/abc?si=tracking'), 'https://youtube.com/watch?v=abc');
  assert.equal(CreateDownloadSchema.safeParse({url:'file:///private'}).success,false);
  assert.equal(CreateDownloadSchema.safeParse({url:'https://user:password@example.com/v'}).success,false);
  assert.equal(CreateDownloadSchema.safeParse({url:'https://example.com/v',extra:true}).success,false);
});
test('new stream replaces processing stage and clamps progress', () => {
  const progress = {percent:100,percentStr:'100%',speed:'--',totalBytes:'--',downloadedBytes:'--',eta:'--',stage:'merging' as const};
  const result = parseProgressLine('__PROGRESS__5%|1MiB/s|10MiB|0.5MiB|00:10',progress);
  assert.equal(result.progress?.stage,'downloading'); assert.equal(result.progress?.percent,5);
  assert.equal(parseProgressLine('__PROGRESS__150%|1|2|3|4',progress).progress?.percent,100);
});
test('Unix dialogs pass shell syntax as arguments, not executable shell code', () => {
  const title = "Title '$() `touch /tmp/owned`";
  for (const platform of ['darwin','linux'] as const) {
    const commands = buildUnixDialogCommands(platform,{type:'folder',title,defaultPath:'/tmp/$HOME'});
    assert.ok(commands.every(c => c.binaryPath !== '/bin/sh' && !c.args.includes('-c')));
    if (platform==='linux') assert.equal(commands[0].args[commands[0].args.indexOf('--title')+1],title);
  }
});
test('filesystem boundaries reject files used as directories and relative cookie paths', async () => {
  await assert.rejects(requireDirectory(new URL(import.meta.url).pathname), OperationError);
  await assert.rejects(requireCookieFile('cookies.txt'), OperationError);
  assert.equal(await requireDirectory(os.tmpdir()), path.resolve(os.tmpdir()));
});
