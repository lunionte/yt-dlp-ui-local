import test from 'node:test';
import assert from 'node:assert/strict';
import cp from 'node:child_process';
import { EventEmitter } from 'node:events';
import { syncBuiltinESMExports } from 'node:module';
import type { AuthContext } from '@ytdlp/shared';
const children: Array<EventEmitter & {pid:number; stdout:EventEmitter; stderr:EventEmitter; args:string[]; closed:boolean}> = [];
const originalSpawn=cp.spawn, originalExecFile=cp.execFile, originalKill=process.kill;
cp.spawn=((_binary:string,args:string[])=>{
  const child=Object.assign(new EventEmitter(),{pid:900000+children.length,stdout:new EventEmitter(),stderr:new EventEmitter(),args,closed:false});
  Object.assign(child.stdout,{setEncoding:()=>{}});
  Object.assign(child.stderr,{setEncoding:()=>{}});
  children.push(child);return child;
}) as typeof cp.spawn;
cp.execFile=((_binary:string,args:string[],_options:unknown,callback:(error:Error|null)=>void)=>{
  const child=children.find(c=>c.pid===Number(args[1]));
  assert.ok(child,'Tests can only terminate their own simulated processes');
  queueMicrotask(()=>{callback(null);if(!child.closed){child.closed=true;child.emit('close',1,null);}});
  return new EventEmitter();
}) as typeof cp.execFile;
if(process.platform!=='win32') process.kill=((pid:number,signal?:string|number)=>{
  const child=children.find(c=>c.pid===Math.abs(pid));
  assert.ok(child,'Only simulated groups may be signalled');
  if(signal===0) throw Object.assign(new Error('Process not found'),{code:'ESRCH'});
  if(!child.closed){child.closed=true;child.emit('close',1,null);}
  return true;
}) as typeof process.kill;
syncBuiltinESMExports();
const {fetchVideoInfo,shutdownMetadata}=await import('../src/services/ytdlp.service.js');
const {getRunningProcessCount}=await import('../src/services/runner.service.js');
const tick=()=>new Promise<void>(resolve=>setImmediate(resolve));
async function waitCount(expected:number){
  const deadline=Date.now()+3000;
  while(children.length<expected && Date.now()<deadline) await tick();
  assert.equal(children.length,expected);
}
function finish(index:number,id='media'){
  const child=children[index];
  child.stdout.emit('data',JSON.stringify({id,title:'Fixture',formats:[{height:720,vcodec:'h264'}]})+'\n');
  child.stderr.emit('data','WARNING: extractor fallback\n');
  child.closed=true;child.emit('close',0,null);
}
test.after(()=>{cp.spawn=originalSpawn;cp.execFile=originalExecFile;process.kill=originalKill;syncBuiltinESMExports();});
test('metadata coalesces identical consumers and one consumer abort does not kill another',async()=>{
  const controller=new AbortController();
  const count=children.length;
  const first=fetchVideoInfo('https://example.com/shared',controller.signal);
  const firstResult=first.catch(error=>error);
  const second=fetchVideoInfo('https://example.com/shared');
  await waitCount(count+1);
  controller.abort();
  assert.equal((await firstResult).name,'AbortError');
  assert.equal(children[count].closed,false);
  finish(count);
  const result=await second;assert.equal(result.warnings.length,1);
  const cached=await fetchVideoInfo('https://example.com/shared');
  assert.equal(cached.id,result.id);assert.equal(children.length,count+1);
});
test('auth contexts do not share cache and browser results are extracted anew',async()=>{
  const browser:AuthContext={mode:'browser',browser:'firefox'};
  const count=children.length;
  const anonymous=fetchVideoInfo('https://example.com/context');
  const authenticated=fetchVideoInfo('https://example.com/context',undefined,browser);
  await waitCount(count+2);
  finish(count,'anonymous');finish(count+1,'authenticated');
  assert.equal((await anonymous).id,'anonymous');assert.equal((await authenticated).id,'authenticated');
  const next=fetchVideoInfo('https://example.com/context',undefined,browser);
  await waitCount(count+3);finish(count+2,'fresh-session');assert.equal((await next).id,'fresh-session');
});
test('metadata bounds admission, limits active children and shutdown cancels all consumers',async()=>{
  const count=children.length;
  const requests=Array.from({length:30},(_,index)=>fetchVideoInfo(`https://example.com/load/${index}`).then(value=>({value}),error=>({error})));
  await waitCount(count+2);
  await tick();
  assert.equal(children.filter(c=>!c.closed).length,2);
  await shutdownMetadata();
  const results=await Promise.all(requests);
  assert.ok(results.every(result=>'error' in result));
  assert.ok(results.some(result=>'error' in result && result.error.details?.code==='CAPACITY'));
  assert.equal(getRunningProcessCount(),0);
  await assert.rejects(fetchVideoInfo('https://example.com/after'),error=>(error as {details:{code:string}}).details.code==='SHUTTING_DOWN');
});
