import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { CreateDownloadSchema, SSEEventSchema, DownloadJobSchema, type SSEEventData } from '@ytdlp/shared';
import { QueueService } from '../src/services/queue.service.js';
import type { ProcessRunOptions, ProcessResult, RunningProcessHandle } from '../src/services/runner.service.js';

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((a,b) => { resolve=a; reject=b; });
  return { promise, resolve, reject };
}
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
function setup(maxConcurrentDownloads=1) {
  const processes: Array<{ options: ProcessRunOptions; done: ReturnType<typeof deferred<ProcessResult>>; killed: number; killFails: boolean }> = [];
  const config = { ytdlpPath:'yt-dlp',ffmpegPath:'ffmpeg',ffprobePath:'ffprobe',defaultDownloadDir:os.tmpdir(),maxConcurrentDownloads,isEmbedded:false };
  const q = new QueueService({
    config: () => config, prepareDirectory: async p => p, validateAuth: async a => a, verifyFile: async () => {},
    createWorkspace: async (folder, id) => path.join(folder, `.ytdlp-${id}-test`),
    publishFile: async (_file, folder, title) => path.join(folder, `${title}.mp4`), removeWorkspace: async () => {},
    run: options => {
      const entry = { options, done:deferred<ProcessResult>(), killed:0, killFails:false };
      processes.push(entry);
      return { pid:1000+processes.length, promise:entry.done.promise, kill:async () => {
        entry.killed++;
        if (entry.killFails) throw new Error('Kill failed');
        await entry.done.promise.catch(() => {});
      } } satisfies RunningProcessHandle;
    },
  });
  const events: SSEEventData[] = [];
  q.on('event', event => { SSEEventSchema.parse(event); events.push(event); });
  const add = (auth = {mode:'none'} as const) => q.addJob(CreateDownloadSchema.parse({url:'https://instagram.com/p/example/',auth}));
  const close = (index=0, exitCode=1, stderr='') => processes[index].done.resolve({exitCode,signal:null,stdout:'',stderr});
  const finalPath = (index=0) => path.join(path.dirname(path.dirname(processes[index].options.args[processes[index].options.args.indexOf('-o')+1])), 'final.mp4');
  return {q,processes,events,add,close,config,finalPath};
}
test('cancellation keeps intent despite late merger output and only completes on close', async () => {
  const {q,processes,events,add,close}=setup();
  const job = await add(); await tick();
  let finished = false;
  const cancel = q.cancelJob(job.id).then(() => {finished=true;});
  processes[0].options.onStdoutLine!('[Merger] Merging formats');
  processes[0].options.onStderrLine!('ERROR: late error');
  await tick();
  assert.equal(finished,false); assert.equal(q.getJob(job.id)?.status,'cancelling');
  close(); await cancel; await tick();
  assert.equal(q.getJob(job.id)?.status,'cancelled');
  assert.ok(!events.some(e => e.type==='STATUS' && ['error','completed'].includes(e.payload.status || '')));
  DownloadJobSchema.parse(q.getJob(job.id));
});
test('shutdown is idempotent, cancels pending work and never spawns its queued jobs', async () => {
  const {q,processes,add,close}=setup(2);
  await add(); await add(); const queued=await add(); await tick();
  const stop=q.shutdown(); assert.equal(q.shutdown(),stop);
  assert.equal(q.getJob(queued.id)?.status,'cancelled');
  close(0); await tick();
  assert.equal(processes.length,2);
  close(1); await stop;
  assert.ok(q.getJobs().every(j=>j.status==='cancelled'));
  await assert.rejects(add(),error => (error as {details:{code:string}}).details.code==='SHUTTING_DOWN');
});
test('a failed kill does not release capacity or fabricate a cancelled job', async () => {
  const {q,processes,add,close}=setup();
  const job=await add(); await add(); await tick();
  processes[0].killFails=true;
  await assert.rejects(q.cancelJob(job.id));
  assert.equal(q.getJob(job.id)?.status,'cancelling'); assert.equal(processes.length,1);
  processes[0].killFails=false;
  const retry=q.cancelJob(job.id); close(); await retry; await tick();
  assert.equal(q.getJob(job.id)?.status,'cancelled'); assert.equal(processes.length,2);
  const stop=q.shutdown(); close(1); await stop;
});
test('auth references never enter public jobs, logs or SSE', async () => {
  const {q,processes,events,close}=setup();
  const job=await q.addJob(CreateDownloadSchema.parse({url:'https://instagram.com/p/example/',auth:{mode:'file',cookiesFile:path.join(os.tmpdir(),'private-cookie-reference.txt')}}));
  await tick();
  processes[0].options.onStderrLine!('Cookie: sessionid=SECRET');
  assert.ok(!JSON.stringify(q.getSnapshot()).includes('SECRET'));
  assert.ok(!JSON.stringify(events).includes('private-cookie-reference'));
  assert.equal('auth' in q.getJob(job.id)!.options,false);
  const cancel=q.cancelJob(job.id);close();await cancel;
});
test('completion requires final output paths; repeated native progress obeys throttle', async () => {
  const {q,processes,events,add,close,finalPath}=setup();
  const job=await add();await tick();
  for(let i=1;i<=5;i++) processes[0].options.onStdoutLine!(`[download] ${i}% of 10.0MiB at 1.0MiB/s ETA 00:05`);
  assert.equal(events.filter(e=>e.type==='PROGRESS').length,1);
  close(0,0);await tick();
  assert.equal(q.getJob(job.id)?.status,'error');
  const second=await add();await tick();
  processes[1].options.onStdoutLine!('__FILE__'+JSON.stringify(finalPath(1)));
  close(1,0);await tick();
  assert.equal(q.getJob(second.id)?.status,'completed');assert.equal(q.getJob(second.id)?.outputFiles.length,1);
});
test('cancel while directory preparation is pending prevents spawn', async () => {
  const directory=deferred<string>();
  let spawned=false;
  const q=new QueueService({
    config:()=>({ytdlpPath:'yt-dlp',ffmpegPath:'ffmpeg',ffprobePath:'ffprobe',defaultDownloadDir:os.tmpdir(),maxConcurrentDownloads:1,isEmbedded:false}),
    prepareDirectory:()=>directory.promise,validateAuth:async a=>a,verifyFile:async()=>{},
    run:()=>{spawned=true;throw new Error('unexpected spawn');},
  });
  const job=await q.addJob(CreateDownloadSchema.parse({url:'https://example.com/v'}));
  await tick();const cancel=q.cancelJob(job.id);
  directory.resolve(os.tmpdir());await cancel;
  assert.equal(spawned,false);assert.equal(q.getJob(job.id)?.status,'cancelled');
});

test('raising concurrency fills available slots and queue admission stays bounded',async()=>{
  const {q,processes,add,close,config}=setup();
  await add();await add();await add();await tick();assert.equal(processes.length,1);
  config.maxConcurrentDownloads=3;q.processQueue();await tick();assert.equal(processes.length,3);
  const stop=q.shutdown();close(0);close(1);close(2);await stop;
  const bounded=setup();for(let i=0;i<100;i++) await bounded.add();await tick();
  await assert.rejects(bounded.add(),error=>(error as {details:{code:string}}).details.code==='CAPACITY');
  const end=bounded.q.shutdown();bounded.close();await end;
});
test('terminal history retention removes oldest jobs through ordered events',async()=>{
  const {q,processes,add,close,events,finalPath}=setup();let first='';
  for(let i=0;i<202;i++){
    const job=await add();if(!i)first=job.id;await tick();
    processes[i].options.onStdoutLine!('__FILE__'+JSON.stringify(finalPath(i)));
    close(i,0);await tick();
  }
  assert.equal(q.getJobs().length,200);assert.equal(q.getJob(first),undefined);
  assert.equal(events.filter(e=>e.type==='JOB_REMOVED').length,2);
  assert.ok(events.every((e,i)=>i===0||e.sequence>events[i-1].sequence));
});
