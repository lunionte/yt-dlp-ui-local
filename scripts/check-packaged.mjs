import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const directory = path.resolve(root, process.argv[2] || 'release/audit-validation/win-unpacked');
const executable = path.join(directory, 'yt-dlp GUI.exe');
const source = `
const path=require('node:path'), assert=require('node:assert/strict'), {once}=require('node:events');
process.env.ELECTRON='1'; process.env.NODE_ENV='production';
process.env.APP_ROOT=path.join(process.resourcesPath,'app.asar');
(async()=>{
 const backend=require(path.join(process.env.APP_ROOT,'backend/dist/server.js'));
 const shared=require(path.join(process.env.APP_ROOT,'node_modules/@ytdlp/shared/dist/index.js'));
 const server=backend.startServer(0); await once(server,'listening');
 try {
   const url='http://127.0.0.1:'+server.address().port;
   const response=await fetch(url+'/api/system/check');
   const status=shared.SystemStatusSchema.parse(await response.json());
   assert.equal(status.tools.ytdlp.available,true); assert.equal(status.tools.ffmpeg.available,true);
   assert.equal(status.tools.ytdlp.source,'resources'); assert.equal(status.tools.ffmpeg.source,'resources');
   assert.equal(status.tools.ytdlp.integrity,'verified'); assert.equal(status.tools.ffmpeg.integrity,'verified');
   assert.equal((await fetch(url+'/')).status,200);
   console.log('PACKAGED_BACKEND_SMOKE_OK');
 } finally { await backend.stopServer(server); }
})().catch(error=>{console.error(error);process.exitCode=1;});
`;
const child = spawn(executable, ['-e', source], {
  cwd: root, env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, windowsHide: true, shell: false, stdio: ['ignore','pipe','pipe'],
});
let output = '';
child.stdout.on('data', chunk => { output += chunk.toString(); process.stdout.write(chunk); });
child.stderr.on('data', chunk => process.stderr.write(chunk));
const timeout = setTimeout(() => {
  console.error('Package check timed out'); process.exitCode = 1;
  if (child.pid) execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 5000 }, error => { if (error) console.error('Cleanup not confirmed:', error.message); });
}, 30000);
child.on('error', error => { clearTimeout(timeout); console.error(error.message); process.exitCode = 1; });
child.on('close', code => {
  clearTimeout(timeout);
  if (code !== 0 || !output.includes('PACKAGED_BACKEND_SMOKE_OK')) process.exitCode = 1;
});
