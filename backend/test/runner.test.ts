import test from 'node:test';
import assert from 'node:assert/strict';
import { runChildProcess, executeBuffered, getRunningProcessCount } from '../src/services/runner.service.js';
test('streaming runner decodes split UTF-8 and flushes final lines at close',async()=>{
  const lines:string[]=[];
  const handle=runChildProcess({binaryPath:process.execPath,args:['-e', "const b=Buffer.from('ação');process.stdout.write(b.subarray(0,2));setTimeout(()=>{process.stdout.write(b.subarray(2));process.stderr.write('last warning')},20)"],onStdoutLine:l=>lines.push(l),onStderrLine:l=>lines.push(l)});
  const result=await handle.promise;
  assert.equal(result.exitCode,0);assert.deepEqual(lines,['ação','last warning']);
  assert.equal(getRunningProcessCount(),0);
});
test('buffered JSON can exceed the streaming line cap; total output remains bounded',async()=>{
  const result=await executeBuffered({binaryPath:process.execPath,args:['-e',"process.stdout.write(JSON.stringify({text:'a'.repeat(400000)}))"],maxBuffer:1024*1024});
  assert.equal(JSON.parse(result.stdout).text.length,400000);
  await assert.rejects(executeBuffered({binaryPath:process.execPath,args:['-e',"process.stdout.write('a'.repeat(100000));setInterval(()=>{},1000)"],maxBuffer:1000}));
  assert.equal(getRunningProcessCount(),0);
});
test('spawn failure settles on close and removes process tracking',async()=>{
  const handle=runChildProcess({binaryPath:'this-executable-does-not-exist-ytdlp-audit',args:[]});
  await assert.rejects(handle.promise);
  assert.equal(getRunningProcessCount(),0);
});
test('timeout and abort end actual owned subprocesses',async()=>{
  const timer=runChildProcess({binaryPath:process.execPath,args:['-e','setInterval(()=>{},1000)'],timeoutMs:80});
  await assert.rejects(timer.promise,error=>(error as NodeJS.ErrnoException).code==='ETIMEDOUT');
  const controller=new AbortController();
  const handle=runChildProcess({binaryPath:process.execPath,args:['-e','setInterval(()=>{},1000)'],signal:controller.signal});
  controller.abort();
  await assert.rejects(handle.promise,error=>(error as Error).name==='AbortError');
  assert.equal(getRunningProcessCount(),0);
});
test('kill waits for close and terminates an owned parent/child tree',async()=>{
  let ready!: (pid:number)=>void;
  const started=new Promise<number>(resolve=>{ready=resolve;});
  const fixture="const {spawn}=require('node:child_process');const child=spawn(process.execPath,['-e',\"console.log('ready');setInterval(()=>{},1000)\"],{stdio:['ignore','pipe','ignore']});child.stdout.once('data',()=>console.log(child.pid));setInterval(()=>{},1000)";
  const handle=runChildProcess({binaryPath:process.execPath,args:['-e',fixture],onStdoutLine:line=>ready(Number(line)),timeoutMs:10000});
  const pid=await started;
  assert.ok(Number.isInteger(pid)&&pid>0);
  await handle.kill();
  await handle.promise;
  assert.equal(getRunningProcessCount(),0);
  assert.throws(()=>process.kill(pid,0),error=>(error as NodeJS.ErrnoException).code==='ESRCH');
});
