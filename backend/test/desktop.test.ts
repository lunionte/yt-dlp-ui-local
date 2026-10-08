import test from 'node:test';
import assert from 'node:assert/strict';
import { createQuitGuard } from '../../desktop/src/lifecycle.js';
const tick=()=>new Promise<void>(resolve=>setImmediate(resolve));
test('Electron quit is prevented until cleanup ends, repeated requests do not duplicate cleanup',async()=>{
  let close!:()=>void,cleanups=0,quits=0,prevented=0;
  const cleanup=new Promise<void>(resolve=>{close=resolve;});
  const handler=createQuitGuard(()=>{cleanups++;return cleanup;},()=>{quits++;},error=>{throw error;});
  const event={preventDefault:()=>{prevented++;}};
  handler(event);handler(event);await tick();
  assert.equal(prevented,2);assert.equal(cleanups,1);assert.equal(quits,0);
  close();await tick();assert.equal(quits,1);
  handler(event);assert.equal(prevented,2);assert.equal(cleanups,1);
});
test('Electron cleanup failure keeps app alive and allows a subsequent quit attempt',async()=>{
  let attempts=0,failures=0,quits=0;
  const handler=createQuitGuard(async()=>{if(++attempts===1)throw new Error('Unconfirmed child');},()=>{quits++;},()=>{failures++;});
  handler({preventDefault:()=>{}});await tick();assert.equal(failures,1);assert.equal(quits,0);
  handler({preventDefault:()=>{}});await tick();assert.equal(attempts,2);assert.equal(quits,1);
});
