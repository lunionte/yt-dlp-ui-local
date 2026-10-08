import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { CreateDownloadSchema, type DownloadJob } from '@ytdlp/shared';
import { loadConfig, checkToolVersion } from '../src/config/paths.js';
import { executeBuffered, runChildProcess, getRunningProcessCount } from '../src/services/runner.service.js';
import { fetchVideoInfo } from '../src/services/ytdlp.service.js';
import { QueueService } from '../src/services/queue.service.js';

test('actual yt-dlp and FFmpeg download a local multi-media page, remux video and extract audio', {timeout:60000},async()=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'ytdlp-ui-media-'));
  const config=loadConfig();
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
    const video=await queue.addJob(CreateDownloadSchema.parse({url,videoResolution:'best',videoContainer:'mkv',outputDir:directory,customFilename:'same-title'}));
    const videoResult=await waitJob(video.id);
    assert.equal(videoResult.status,'completed',JSON.stringify(videoResult.errorDetails));
    assert.equal(videoResult.outputFiles.length,2);
    assert.equal(new Set(videoResult.outputFiles).size,2);
    assert.ok(videoResult.outputFiles.every(file=>file.endsWith('.mkv')));
    assert.equal(videoResult.metadata?.kind,'collection');
    assert.ok(progressStages.includes('downloading'),'Structured download progress must remain enabled alongside --print');
    assert.ok(progressStages.includes('processing'),'Remux postprocessing hooks must report the actual stage');
    assert.ok(videoResult.logs.every(line=>!line.startsWith('__INFO__')));
    const probe=await runChildProcess({binaryPath:config.ffmpegPath,args:['-i',videoResult.outputFiles[0]],captureOutput:true,timeoutMs:10000}).promise;
    assert.match(probe.stderr,/matroska/);
    const audio=await queue.addJob(CreateDownloadSchema.parse({url,mode:'audio',audioFormat:'mp3',audioQuality:'320k',outputDir:directory,customFilename:'same-title'}));
    const audioResult=await waitJob(audio.id);
    assert.equal(audioResult.status,'completed',JSON.stringify(audioResult.errorDetails));
    assert.equal(audioResult.outputFiles.length,2);
    assert.ok(audioResult.outputFiles.every(file=>file.endsWith('.mp3')));
    console.log(`Local media: ${preview.entries.length} entries, ${videoResult.outputFiles.length} MKV, ${audioResult.outputFiles.length} MP3; engine ${'version' in tool ? tool.version : ''}`);
  }finally{
    await queue.shutdown();
    await new Promise<void>(resolve=>{server.close(()=>resolve());server.closeAllConnections();});
    // This directory is owned by this test and never contains user media.
    assert.ok(path.isAbsolute(directory) && directory.startsWith(path.join(os.tmpdir(),'ytdlp-ui-media-')));
    await fs.rm(directory,{recursive:true,force:true});
  }
  assert.equal(getRunningProcessCount(),0);
});
