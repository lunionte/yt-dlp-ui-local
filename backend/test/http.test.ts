import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/server.js';
import { QueueService } from '../src/services/queue.service.js';
import { OperationError } from '../src/services/error.service.js';
import { ApiErrorSchema, JobsSnapshotSchema } from '@ytdlp/shared';

test('HTTP enforces schemas/origins, catches async failures and returns structured metadata errors',async()=>{
  const queue=new QueueService();
  const app=createApp(queue,async()=>{throw new OperationError('RATE_LIMITED','metadata','HTTP 429',429);});
  const server=app.listen(0,'127.0.0.1');
  await once(server,'listening');
  const address=server.address();assert.ok(address && typeof address!=='string');
  const root=`http://127.0.0.1:${address.port}`;
  try{
    const snapshot=await fetch(root+'/api/downloads');
    JobsSnapshotSchema.parse(await snapshot.json());
    const failure=await fetch(root+'/api/info',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:'https://instagram.com/p/example/'})});
    assert.equal(failure.status,429);
    assert.equal(ApiErrorSchema.parse(await failure.json()).details.code,'RATE_LIMITED');
    const invalid=await fetch(root+'/api/downloads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:'https://example.com/v',title:42})});
    assert.equal(invalid.status,400);ApiErrorSchema.parse(await invalid.json());
    const denied=await fetch(root+'/api/downloads',{headers:{Origin:'https://external.example'}});
    assert.equal(denied.status,403);
    const malformed=await fetch(root+'/api/info',{method:'POST',headers:{'Content-Type':'application/json'},body:'{broken'});
    assert.equal(malformed.status,400);ApiErrorSchema.parse(await malformed.json());
    await queue.shutdown();
    const stopped=await fetch(root+'/api/downloads');assert.equal(stopped.status,503);
  }finally{await new Promise<void>(resolve=>{server.close(()=>resolve());server.closeAllConnections();});}
});
