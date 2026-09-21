import { spawn, ChildProcess } from 'node:child_process';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

export interface ProcessRunOptions {
  binaryPath: string;
  args: string[];
  cwd?: string;
  onStdoutLine?: (line: string) => void;
  onStderrLine?: (line: string) => void;
}

export interface RunningProcessHandle {
  pid: number | undefined;
  kill: () => Promise<void>;
  promise: Promise<{ exitCode: number | null; signal: string | null }>;
}

export function killProcessTree(pid: number): Promise<void> {
  return new Promise((resolve) => {
    if (process.platform === 'win32') {
      exec(`taskkill /PID ${pid} /T /F`, (err) => {
        // Ignora erro se o processo já tiver terminado
        resolve();
      });
    } else {
      try {
        process.kill(-pid, 'SIGTERM');
      } catch {
        try {
          process.kill(pid, 'SIGTERM');
        } catch {
          // Já finalizado
        }
      }
      resolve();
    }
  });
}

export function runChildProcess(options: ProcessRunOptions): RunningProcessHandle {
  const { binaryPath, args, cwd, onStdoutLine, onStderrLine } = options;

  const child: ChildProcess = spawn(binaryPath, args, {
    cwd: cwd || process.cwd(),
    shell: false,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let killedManually = false;

  const kill = async () => {
    killedManually = true;
    if (child.pid) {
      await killProcessTree(child.pid);
    }
  };

  // Processa stdout linha a linha
  let stdoutBuffer = '';
  child.stdout?.on('data', (chunk: Buffer) => {
    stdoutBuffer += chunk.toString('utf-8');
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() || '';
    for (const line of lines) {
      if (line.trim() && onStdoutLine) {
        onStdoutLine(line);
      }
    }
  });

  // Processa stderr linha a linha
  let stderrBuffer = '';
  child.stderr?.on('data', (chunk: Buffer) => {
    stderrBuffer += chunk.toString('utf-8');
    const lines = stderrBuffer.split(/\r?\n/);
    stderrBuffer = lines.pop() || '';
    for (const line of lines) {
      if (line.trim() && onStderrLine) {
        onStderrLine(line);
      }
    }
  });

  const promise = new Promise<{ exitCode: number | null; signal: string | null }>((resolve, reject) => {
    child.on('error', (err) => {
      reject(err);
    });

    child.on('close', (code, signal) => {
      // Processa restos de buffer se houver
      if (stdoutBuffer.trim() && onStdoutLine) {
        onStdoutLine(stdoutBuffer.trim());
      }
      if (stderrBuffer.trim() && onStderrLine) {
        onStderrLine(stderrBuffer.trim());
      }

      resolve({ exitCode: code, signal });
    });
  });

  return {
    pid: child.pid,
    kill,
    promise,
  };
}
