import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { CreateDownloadSchema, normalizeFileStem, type DownloadJob } from '@ytdlp/shared';
import { loadConfig, checkToolVersion } from '../src/config/paths.js';
import { executeBuffered, runChildProcess, getRunningProcessCount } from '../src/services/runner.service.js';
import { fetchVideoInfo, buildVideoFormatSelector } from '../src/services/ytdlp.service.js';
import { QueueService } from '../src/services/queue.service.js';

test('native yt-dlp selection respects portrait/landscape ceilings for separate and combined streams', { timeout: 120000 }, async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'ytdlp-ui-formats-'));
  const config = loadConfig();
  const fixture = path.join(directory, 'formats.json');
  const dimensions = [[360, 640], [720, 1280], [1080, 1920], [2160, 3840]];
  try {
    for (const portrait of [true, false]) for (const combined of [true, false]) {
      const formats = dimensions.map(([width, height], index) => ({
        format_id: `v${index}`, width: portrait ? width : height, height: portrait ? height : width,
        url: 'https://example.invalid/video.mp4', ext: 'mp4', vcodec: 'h264', acodec: combined ? 'aac' : 'none', tbr: 100 * (index + 1),
      }));
      // No webpage_url: yt-dlp otherwise retries extraction from that URL after a selection error.
      const data = { id: 'fixture', title: 'Format selection fixture', extractor: 'generic', formats: [
        ...formats, ...(combined ? [] : [{ format_id: 'audio', url: 'https://example.invalid/audio.m4a', ext: 'm4a', vcodec: 'none', acodec: 'aac' }]),
      ] };
      await fs.writeFile(fixture, JSON.stringify(data));
      for (const [resolution, expected] of [['720p', 1], ['1080p', 2], ['best', 3]] as const) {
        const result = await executeBuffered({ binaryPath: config.ytdlpPath, args: [
          '--ignore-config', '--no-cache-dir', '--load-info-json', fixture, '--simulate', '--no-check-formats',
          '-f', buildVideoFormatSelector(resolution), '--print', '__SELECTION__%(.{width,height,format_id})j',
        ], timeoutMs: 15000 });
        const line = result.stdout.split(/\r?\n/).find(value => value.startsWith('__SELECTION__'))!;
        const selected = JSON.parse(line.slice('__SELECTION__'.length));
        assert.equal(selected.width, formats[expected].width);
        assert.equal(selected.height, formats[expected].height);
      }
      // No unrestricted fallback is allowed, including when only an oversized or unknown format exists.
      for (const candidate of [formats[3], { ...formats[0], width: undefined, height: undefined }]) {
        await fs.writeFile(fixture, JSON.stringify({ ...data, formats: [candidate, ...data.formats.filter(format => format.vcodec === 'none')] }));
        await assert.rejects(executeBuffered({ binaryPath: config.ytdlpPath, args: [
          '--ignore-config', '--no-cache-dir', '--load-info-json', fixture, '--simulate', '--no-check-formats',
          '-f', buildVideoFormatSelector('1080p'),
        ], timeoutMs: 15000 }), /Requested format is not available/);
      }
    }
  } finally {
    assert.ok(path.isAbsolute(directory) && directory.startsWith(path.join(os.tmpdir(), 'ytdlp-ui-formats-')));
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test('actual yt-dlp and FFmpeg publish readable original/custom names and concurrent collections', {timeout:120000},async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'ytdlp-ui-media-'));
  const config=loadConfig();
  const outputDir=path.join(directory,'50% downloads');
  const tool=await checkToolVersion(config.ytdlpPath);
  assert.ok(tool.available,'yt-dlp must be installed for this integration gate');
  const source=path.join(directory,'source.mp4');
  await executeBuffered({binaryPath:config.ffmpegPath,args:['-y','-f','lavfi','-i','color=c=blue:s=320x180:r=10','-f','lavfi','-i','sine=frequency=440:sample_rate=44100','-t','1','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',source],timeoutMs:15000});
  const media=await fs.readFile(source);
  const server=createServer((req,res)=>{
    if(req.url?.endsWith('.mp4')){res.writeHead(200,{'Content-Type':'video/mp4','Content-Length':media.length});res.end(media);}
    else{res.writeHead(200,{'Content-Type':'text/html'});res.end('<html><head><title>Audit fixture</title></head><body><video src="/a.mp4"></video><video src="/b.mp4"></video></body></html>');}
  });
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const address=server.address();assert.ok(address&&typeof address!=='string');
  const url=`http://127.0.0.1:${address.port}/post`;
  const queue=new QueueService();
  const progressStages:string[]=[];
  queue.on('event',event=>{if(event.type==='PROGRESS') progressStages.push(event.payload.progress.stage);});
  const waitJob=(id:string):Promise<DownloadJob>=>new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Download local excedeu prazo')),30000);
    const listener=()=>{
      const job=queue.getJob(id)!;
      if(['completed','error','cancelled'].includes(job.status)){clearTimeout(timer);queue.off('event',listener);resolve(job);}
    };
    queue.on('event',listener);listener();
  });
  try{
    const preview=await fetchVideoInfo(url);
    assert.equal(preview.kind,'collection');assert.equal(preview.entries.length,2);
    const customFilename = 'CON.txt 50% / vídeo 🎬';
    const stem = normalizeFileStem(customFilename);
    const video=await queue.addJob(CreateDownloadSchema.parse({url,videoResolution:'best',videoContainer:'mkv',outputDir,customFilename}));
    const videoResult=await waitJob(video.id);
    assert.equal(videoResult.status,'completed',JSON.stringify(videoResult.errorDetails));
    assert.equal(videoResult.outputFiles.length,2);
    assert.equal(new Set(videoResult.outputFiles).size,2);
    assert.ok(videoResult.outputFiles.every(file=>file.endsWith('.mkv')));
    assert.deepEqual(videoResult.outputFiles.map(file => path.basename(file)), [`${stem}.mkv`, `${stem} (2).mkv`]);
    assert.equal(videoResult.metadata?.kind,'collection');
    assert.ok(progressStages.includes('downloading'),'Structured download progress must remain enabled alongside --print');
    assert.ok(progressStages.includes('processing'),'Remux postprocessing hooks must report the actual stage');
    assert.ok(videoResult.logs.every(line=>!line.startsWith('__INFO__')));
    const probe=await runChildProcess({binaryPath:config.ffmpegPath,args:['-i',videoResult.outputFiles[0]],captureOutput:true,timeoutMs:10000}).promise;
    assert.match(probe.stderr,/matroska/);
    const audio=await queue.addJob(CreateDownloadSchema.parse({url,mode:'audio',audioFormat:'mp3',audioQuality:'320k',outputDir,customFilename}));
    const audioResult=await waitJob(audio.id);
    assert.equal(audioResult.status,'completed',JSON.stringify(audioResult.errorDetails));
    assert.equal(audioResult.outputFiles.length,2);
    assert.ok(audioResult.outputFiles.every(file=>file.endsWith('.mp3')));
    assert.deepEqual(audioResult.outputFiles.map(file => path.basename(file)), [`${stem}.mp3`, `${stem} (2).mp3`]);
    const original = await queue.addJob(CreateDownloadSchema.parse({url,videoResolution:'best',videoContainer:'mkv',outputDir}));
    const originalResult = await waitJob(original.id);
    assert.equal(originalResult.status, 'completed', JSON.stringify(originalResult.errorDetails));
    assert.deepEqual(originalResult.outputFiles.map(file => path.basename(file)), originalResult.metadata!.entries.map(entry => `${normalizeFileStem(entry.title)}.mkv`));
    const concurrent = await Promise.all([1,2].map(() => queue.addJob(CreateDownloadSchema.parse({url,videoResolution:'best',videoContainer:'mkv',outputDir,customFilename}))));
    const results = await Promise.all(concurrent.map(job => waitJob(job.id)));
    assert.ok(results.every(job => job.status === 'completed'), JSON.stringify(results.map(job => job.errorDetails)));
    assert.deepEqual(results.flatMap(job => job.outputFiles).map(file => path.basename(file)).sort(), [3,4,5,6].map(index => `${stem} (${index}).mkv`));
    await queue.shutdown();
    assert.ok(!(await fs.readdir(outputDir)).some(name => name.startsWith('.ytdlp-')));
    console.log(`Local media: original titles, Unicode/custom names, MP3/MKV and concurrent collisions verified; engine ${'version' in tool ? tool.version : ''}`);
  }finally{
    await queue.shutdown();
    await new Promise<void>(resolve=>{server.close(()=>resolve());server.closeAllConnections();});
    // This directory is owned by this test and never contains user media.
    assert.ok(path.isAbsolute(directory) && directory.startsWith(path.join(os.tmpdir(),'ytdlp-ui-media-')));
    await fs.rm(directory,{recursive:true,force:true});
  }
  assert.equal(getRunningProcessCount(),0);
});
