import test from 'node:test';
import assert from 'node:assert/strict';
import { DownloadJobSchema, applyJobEvent, type SSEEventData } from '@ytdlp/shared';
import { reconcileSnapshot } from '../src/utils/reconcile.js';
import { formatFriendlyErrorMessage } from '../src/utils/error.js';
const job=DownloadJobSchema.parse({id:'a',url:'https://example.com/v',title:'A',options:{url:'https://example.com/v'},status:'downloading',progress:{percent:10,percentStr:'10%',speed:'--',totalBytes:'--',downloadedBytes:'--',eta:'--',stage:'downloading'},outputFiles:[],logs:[],createdAt:1,revision:10});
test('snapshot reconciliation preserves newer updates and removals',()=>{
  const completed: SSEEventData={type:'STATUS',jobId:'a',sequence:12,payload:{status:'completed',progress:{...job.progress,percent:100,stage:'completed'}}};
  assert.equal(reconcileSnapshot({sequence:10,jobs:[job]},[completed])[0].status,'completed');
  const removed: SSEEventData={type:'JOB_REMOVED',jobId:'a',sequence:13,payload:{id:'a'}};
  assert.deepEqual(reconcileSnapshot({sequence:10,jobs:[job]},[removed,completed]),[]);
  assert.equal(applyJobEvent([{...job,revision:14}],completed)[0].revision,14);
});
test('presentation does not invent public/private causes from a long message',()=>{
  const message='An unknown failure '.repeat(10);
  assert.equal(formatFriendlyErrorMessage(message),message);
  assert.ok(!formatFriendlyErrorMessage(null).includes('públic'));
});
