import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { OperationError } from './error.service.js';

export interface ProcessRunOptions {
  binaryPath: string; args: string[]; cwd?: string;
  onStdoutLine?: (line: string) => void; onStderrLine?: (line: string) => void;
  signal?: AbortSignal; timeoutMs?: number; captureOutput?: boolean; maxBuffer?: number;
}
export interface ProcessResult { exitCode: number | null; signal: string | null; stdout: string; stderr: string; }
export interface RunningProcessHandle { pid: number | undefined; kill: () => Promise<void>; promise: Promise<ProcessResult>; }
const running = new Set<RunningProcessHandle>();
let stopping = false;
const MAX_LINE = 256 * 1024;
export async function killProcessTree(pid: number): Promise<void> {
  if (process.platform === 'win32') return new Promise((resolve, reject) => {
    execFile('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, timeout: 5000 }, error => error ? reject(error) : resolve());
  });
  try {
    process.kill(-pid, 'SIGTERM');
    const deadline = Date.now() + 1500;
    while (Date.now() < deadline) {
      await new Promise<void>(resolve => setTimeout(resolve, 50));
      try { process.kill(-pid, 0); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return; throw error; }
    }
    process.kill(-pid, 'SIGKILL');
    return;
  }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ESRCH') return Promise.resolve();
    return Promise.reject(error);
  }
}
export function runChildProcess(options: ProcessRunOptions): RunningProcessHandle {
  if (stopping) throw new OperationError('SHUTTING_DOWN', 'system', '', 503);
  if (options.signal?.aborted) throw Object.assign(new Error('Operação cancelada'), { name: 'AbortError' });
  const child: ChildProcess = spawn(options.binaryPath, options.args, {
    cwd: options.cwd || process.cwd(), shell: false, windowsHide: true, detached: process.platform !== 'win32',
    stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PYTHONIOENCODING: 'utf-8', PYTHONUTF8: '1' },
  });
  let closed = false;
  let processError: Error | undefined;
  let stdout = '', stderr = '', stdoutBuffer = '', stderrBuffer = '';
  let killPromise: Promise<void> | undefined;
  let resolveClose!: () => void;
  const closePromise = new Promise<void>(resolve => { resolveClose = resolve; });
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const kill = (): Promise<void> => {
    if (closed) return Promise.resolve();
    if (killPromise) return killPromise;
    killPromise = (async () => {
      if (child.pid) {
        try { await killProcessTree(child.pid); } catch (error) { if (!closed) throw error; }
      }
      let deadline: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([closePromise, new Promise<never>((_, reject) => { deadline = setTimeout(() => reject(new Error('Não foi possível confirmar o encerramento do processo')), 10000); })]);
      } finally { if (deadline) clearTimeout(deadline); }
    })().catch(error => { killPromise = undefined; throw error; });
    return killPromise;
  };
  const requestKill = (error: Error) => {
    processError ||= error;
    void kill().catch(killError => { processError ||= killError; });
  };
  const abort = () => requestKill(Object.assign(new Error('Operação cancelada'), { name: 'AbortError' }));
  child.stdout?.setEncoding('utf8'); child.stderr?.setEncoding('utf8');
  const handleChunk = (chunk: string, isError: boolean) => {
    if (options.captureOutput) {
      if (isError) stderr += chunk; else stdout += chunk;
      if (stdout.length + stderr.length > (options.maxBuffer || 20 * 1024 * 1024)) {
        stdout = stdout.slice(0, options.maxBuffer || 20 * 1024 * 1024);
        stderr = stderr.slice(-20000);
        requestKill(new Error('A saída da ferramenta excedeu o limite de buffer')); return;
      }
      if (!options.onStdoutLine && !options.onStderrLine) return;
    } else if (isError) stderr = (stderr + chunk).slice(-20000);
    let buffer = (isError ? stderrBuffer : stdoutBuffer) + chunk;
    if (buffer.length > MAX_LINE && !buffer.includes('\n')) {
      requestKill(new Error('Uma linha da ferramenta excedeu o limite de buffer')); buffer = buffer.slice(-MAX_LINE);
    }
    const lines = buffer.split(/\r?\n/);
    const remainder = lines.pop() || '';
    if (isError) stderrBuffer = remainder; else stdoutBuffer = remainder;
    for (const line of lines) {
      if (line.length > MAX_LINE && !options.captureOutput) { requestKill(new Error('Uma linha da ferramenta excedeu o limite de buffer')); continue; }
      const callback = isError ? options.onStderrLine : options.onStdoutLine;
      if (line.trim() && callback) try { callback(line); } catch (error) { requestKill(error as Error); }
    }
  };
  child.stdout?.on('data', (chunk: string) => handleChunk(chunk, false));
  child.stderr?.on('data', (chunk: string) => handleChunk(chunk, true));
  const promise = new Promise<ProcessResult>((resolve, reject) => {
    child.on('error', error => { processError ||= error; });
    child.once('close', async (exitCode, signal) => {
      closed = true;
      if (timeout) clearTimeout(timeout);
      options.signal?.removeEventListener('abort', abort);
      for (const [tail, callback] of [[stdoutBuffer, options.onStdoutLine], [stderrBuffer, options.onStderrLine]] as const) {
        if (tail.trim() && callback) try { callback(tail); } catch (error) { processError ||= error as Error; }
      }
      resolveClose();
      if (killPromise) try { await killPromise; } catch (error) { processError ||= error as Error; }
      running.delete(handle);
      if (processError) reject(Object.assign(processError, { stderr }));
      else resolve({ exitCode, signal, stdout, stderr });
    });
  });
  const handle: RunningProcessHandle = { pid: child.pid, kill, promise };
  running.add(handle);
  // Prevent an abort before the caller attaches its own handler from becoming unhandled.
  void promise.catch(() => {});
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) abort();
  if (options.timeoutMs) timeout = setTimeout(() => requestKill(Object.assign(new Error('Tempo limite de execução excedido'), { code: 'ETIMEDOUT' })), options.timeoutMs);
  return handle;
}
export async function executeBuffered(options: Omit<ProcessRunOptions, 'captureOutput'>): Promise<ProcessResult> {
  const result = await runChildProcess({ ...options, captureOutput: true }).promise;
  if (result.exitCode !== 0) throw Object.assign(new Error(result.stderr || `Ferramenta encerrou com código ${result.exitCode}`), { stderr: result.stderr, signal: result.signal, exitCode: result.exitCode });
  return result;
}
export async function shutdownProcesses(): Promise<void> {
  stopping = true;
  const results = await Promise.allSettled([...running].map(handle => handle.kill()));
  const failures = results.filter(result => result.status === 'rejected');
  if (failures.length || running.size) throw new Error('Há subprocessos cujo encerramento não foi confirmado');
}
export function getRunningProcessCount(): number { return running.size; }
