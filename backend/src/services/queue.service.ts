import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import { CreateDownloadInput, DownloadJob, DownloadProgress } from '../schemas/download.schema.js';
import { loadConfig } from '../config/paths.js';
import { buildYtdlpArgs, fetchVideoInfo } from './ytdlp.service.js';
import { runChildProcess, RunningProcessHandle } from './runner.service.js';
import { parseProgressLine } from './parser.service.js';

export interface SSEEventData {
  type: 'PROGRESS' | 'STATUS' | 'LOG' | 'JOB_ADDED' | 'JOB_REMOVED';
  jobId: string;
  payload: any;
}

class QueueService extends EventEmitter {
  private jobs: Map<string, DownloadJob> = new Map();
  private activeHandles: Map<string, RunningProcessHandle> = new Map();

  constructor() {
    super();
  }

  public getJobs(): DownloadJob[] {
    return Array.from(this.jobs.values()).sort((a, b) => b.createdAt - a.createdAt);
  }

  public getJob(id: string): DownloadJob | undefined {
    return this.jobs.get(id);
  }

  public deleteJob(id: string): boolean {
    const job = this.jobs.get(id);
    if (!job) return false;

    if (job.status === 'downloading' || job.status === 'processing') {
      this.cancelJob(id);
    }

    this.jobs.delete(id);
    this.emitEvent({
      type: 'JOB_REMOVED',
      jobId: id,
      payload: { id },
    });
    return true;
  }

  public async addJob(options: CreateDownloadInput, initialTitle?: string): Promise<DownloadJob> {
    const id = crypto.randomUUID();

    const initialProgress: DownloadProgress = {
      percent: 0,
      percentStr: '0%',
      speed: '--',
      downloadedBytes: '0 B',
      totalBytes: '--',
      eta: '--:--',
      stage: 'queued',
    };

    const job: DownloadJob = {
      id,
      url: options.url,
      title: initialTitle || options.customFilename || 'Carregando informações...',
      options,
      status: 'queued',
      progress: initialProgress,
      logs: [],
      createdAt: Date.now(),
    };

    this.jobs.set(id, job);

    this.emitEvent({
      type: 'JOB_ADDED',
      jobId: id,
      payload: job,
    });

    // Tenta obter metadados em background se não tiver título prévio
    if (!initialTitle) {
      fetchVideoInfo(options.url)
        .then((meta) => {
          if (this.jobs.has(id)) {
            const current = this.jobs.get(id)!;
            current.title = meta.title;
            current.thumbnail = meta.thumbnail;
            current.duration = meta.duration;
            this.emitEvent({
              type: 'STATUS',
              jobId: id,
              payload: { title: meta.title, thumbnail: meta.thumbnail, duration: meta.duration },
            });
          }
        })
        .catch(() => {
          // Mantém o título padrão se a prévia falhar
        });
    }

    this.processQueue();
    return job;
  }

  public async cancelJob(id: string): Promise<boolean> {
    const job = this.jobs.get(id);
    if (!job) return false;

    if (job.status === 'queued') {
      job.status = 'cancelled';
      this.emitEvent({
        type: 'STATUS',
        jobId: id,
        payload: { status: 'cancelled' },
      });
      return true;
    }

    const handle = this.activeHandles.get(id);
    if (handle) {
      try {
        await handle.kill();
      } catch (err) {
        // Ignora erro ao matar
      }
      this.activeHandles.delete(id);
    }

    job.status = 'cancelled';
    job.completedAt = Date.now();
    job.progress.stage = 'cancelled';

    this.emitEvent({
      type: 'STATUS',
      jobId: id,
      payload: { status: 'cancelled', progress: job.progress },
    });

    this.processQueue();
    return true;
  }

  private emitEvent(event: SSEEventData) {
    this.emit('event', event);
  }

  private processQueue() {
    const config = loadConfig();
    const maxActive = config.maxConcurrentDownloads || 2;

    const activeCount = this.activeHandles.size;
    if (activeCount >= maxActive) {
      return;
    }

    // Encontra o próximo job na fila
    const queuedJob = Array.from(this.jobs.values()).find((j) => j.status === 'queued');
    if (!queuedJob) {
      return;
    }

    this.startJob(queuedJob);
  }

  private async startJob(job: DownloadJob) {
    const config = loadConfig();
    const { args, outputFolder } = buildYtdlpArgs(job.options);

    job.status = 'downloading';
    job.progress.stage = 'downloading';
    job.outputPath = outputFolder;

    this.emitEvent({
      type: 'STATUS',
      jobId: job.id,
      payload: { status: 'downloading', outputPath: outputFolder },
    });

    const handle = runChildProcess({
      binaryPath: config.ytdlpPath,
      args,
      onStdoutLine: (line) => this.handleOutputLine(job.id, line),
      onStderrLine: (line) => this.handleOutputLine(job.id, line, true),
    });

    this.activeHandles.set(job.id, handle);

    try {
      const result = await handle.promise;
      this.activeHandles.delete(job.id);

      // Se o job foi marcado como cancelado, não sobrescreve com concluído
      const currentJob = this.jobs.get(job.id);
      if (currentJob && currentJob.status === 'cancelled') {
        this.processQueue();
        return;
      }

      if (result.exitCode === 0) {
        if (currentJob) {
          currentJob.status = 'completed';
          currentJob.completedAt = Date.now();
          currentJob.progress.percent = 100;
          currentJob.progress.percentStr = '100%';
          currentJob.progress.stage = 'completed';
          this.emitEvent({
            type: 'STATUS',
            jobId: job.id,
            payload: { status: 'completed', progress: currentJob.progress },
          });
        }
      } else {
        if (currentJob) {
          currentJob.status = 'error';
          currentJob.completedAt = Date.now();
          currentJob.error = `O processo encerrou com código ${result.exitCode}`;
          currentJob.progress.stage = 'error';
          this.emitEvent({
            type: 'STATUS',
            jobId: job.id,
            payload: { status: 'error', error: currentJob.error, progress: currentJob.progress },
          });
        }
      }
    } catch (err: any) {
      this.activeHandles.delete(job.id);
      const currentJob = this.jobs.get(job.id);
      if (currentJob && currentJob.status !== 'cancelled') {
        currentJob.status = 'error';
        currentJob.completedAt = Date.now();
        currentJob.error = err.message || 'Erro inesperado no processo';
        currentJob.progress.stage = 'error';
        this.emitEvent({
          type: 'STATUS',
          jobId: job.id,
          payload: { status: 'error', error: currentJob.error, progress: currentJob.progress },
        });
      }
    }

    this.processQueue();
  }

  private handleOutputLine(jobId: string, line: string, isError = false) {
    const job = this.jobs.get(jobId);
    if (!job) return;

    // Guarda histórico de logs (máximo 200 linhas)
    job.logs.push(line);
    if (job.logs.length > 200) {
      job.logs.shift();
    }

    // Emite evento de log
    this.emitEvent({
      type: 'LOG',
      jobId,
      payload: { line, isError },
    });

    // Faz o parse do progresso
    const { progress, stage } = parseProgressLine(line, job.progress);
    let updated = false;

    if (stage && stage !== job.progress.stage) {
      job.progress.stage = stage;
      if (stage === 'merging' || stage === 'extracting_audio' || stage === 'processing') {
        job.status = 'processing';
      }
      updated = true;
    }

    if (progress) {
      job.progress = {
        ...job.progress,
        ...progress,
      };
      updated = true;
    }

    if (updated) {
      this.emitEvent({
        type: 'PROGRESS',
        jobId,
        payload: { progress: job.progress, status: job.status },
      });
    }
  }
}

export const queueService = new QueueService();
