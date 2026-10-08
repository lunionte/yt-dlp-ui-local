import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { DownloadOptionsSchema, MediaEntrySchema } from '@ytdlp/shared';
import { loadConfig, verifyBinaryIntegrity } from '../config/paths.js';
import { buildYtdlpArgs, validateAuthContext, parseMetadata } from './ytdlp.service.js';
import { runChildProcess } from './runner.service.js';
import { prepareOutputDirectory } from './path.service.js';
import { classifyFailure, OperationError, redactDiagnostic } from './error.service.js';
import { parseProgressLine, PROGRESS_PREFIX } from './parser.service.js';
const terminal = new Set(['completed', 'cancelled', 'error']);
const transitions = {
    queued: ['downloading', 'cancelled'], downloading: ['processing', 'cancelling', 'completed', 'error'],
    processing: ['downloading', 'cancelling', 'completed', 'error'], cancelling: ['cancelled'],
    completed: [], cancelled: [], error: [],
};
const dependencies = {
    run: runChildProcess, identity: verifyBinaryIntegrity, prepareDirectory: prepareOutputDirectory, validateAuth: validateAuthContext, config: loadConfig,
    verifyFile: async (file) => { if (!(await fs.stat(file)).isFile())
        throw new Error('Arquivo de saída não encontrado'); },
};
export class QueueService extends EventEmitter {
    deps;
    jobs = new Map();
    activeHandles = new Map();
    tasks = new Map();
    contexts = new Map();
    cancelRequests = new Set();
    cancellations = new Map();
    lastProgressEmit = new Map();
    sequence = 0;
    stopping = false;
    shutdownPromise;
    constructor(deps = dependencies) {
        super();
        this.deps = deps;
    }
    getJobs() { return structuredClone([...this.jobs.values()].sort((a, b) => b.createdAt - a.createdAt)); }
    getSnapshot() { return { sequence: this.sequence, jobs: this.getJobs() }; }
    getJob(id) { const job = this.jobs.get(id); return job && structuredClone(job); }
    isStopping() { return this.stopping; }
    emitEvent(event) {
        const sequence = ++this.sequence;
        const job = this.jobs.get(event.jobId);
        if (job)
            job.revision = sequence;
        this.emit('event', structuredClone({ ...event, sequence }));
    }
    transition(job, status) {
        if (job.status === status)
            return false;
        if (!transitions[job.status].includes(status))
            return false;
        job.status = status;
        if (terminal.has(status)) {
            job.completedAt = Date.now();
            job.progress.stage = status;
            this.contexts.delete(job.id);
        }
        else if (status === 'cancelling')
            job.progress.stage = 'cancelling';
        this.emitEvent({ type: 'STATUS', jobId: job.id, payload: job });
        return true;
    }
    async addJob(input) {
        if (this.stopping)
            throw new OperationError('SHUTTING_DOWN', 'download', '', 503);
        if ([...this.jobs.values()].filter(j => !terminal.has(j.status)).length >= 100)
            throw new OperationError('CAPACITY', 'download', '', 503);
        const id = crypto.randomUUID();
        const job = {
            id, url: input.url, title: input.title || input.customFilename || 'Extraindo mídia...',
            options: DownloadOptionsSchema.parse(Object.fromEntries(Object.entries(input).filter(([key]) => key !== 'auth' && key !== 'title'))),
            status: 'queued', progress: { percent: 0, percentStr: '0%', speed: '--', downloadedBytes: '0 B', totalBytes: '--', eta: '--:--', stage: 'queued' },
            logs: [], outputFiles: [], createdAt: Date.now(), revision: 0,
        };
        this.jobs.set(id, job);
        this.contexts.set(id, input.auth);
        this.emitEvent({ type: 'JOB_ADDED', jobId: id, payload: job });
        this.processQueue();
        return this.getJob(id);
    }
    async cancelJob(id) {
        const existing = this.cancellations.get(id);
        if (existing)
            return existing;
        const job = this.jobs.get(id);
        if (!job || terminal.has(job.status))
            return false;
        this.cancelRequests.add(id);
        if (job.status === 'queued') {
            this.transition(job, 'cancelled');
            this.cancelRequests.delete(id);
            this.processQueue();
            return true;
        }
        this.transition(job, 'cancelling');
        const operation = (async () => {
            const handle = this.activeHandles.get(id);
            if (handle)
                try {
                    await handle.kill();
                }
                catch (error) {
                    const failure = classifyFailure(error, 'download');
                    job.error = failure.message;
                    job.errorDetails = failure.details;
                    this.emitEvent({ type: 'STATUS', jobId: id, payload: { error: job.error, errorDetails: job.errorDetails } });
                    throw failure;
                }
            await this.tasks.get(id);
            return true;
        })().finally(() => this.cancellations.delete(id));
        this.cancellations.set(id, operation);
        return operation;
    }
    async deleteJob(id) {
        if (!this.jobs.has(id))
            return false;
        if (!terminal.has(this.jobs.get(id).status))
            await this.cancelJob(id);
        if (this.tasks.has(id))
            await this.tasks.get(id);
        this.jobs.delete(id);
        this.contexts.delete(id);
        this.lastProgressEmit.delete(id);
        this.emitEvent({ type: 'JOB_REMOVED', jobId: id, payload: { id } });
        return true;
    }
    processQueue() {
        if (this.stopping)
            return;
        const max = this.deps.config().maxConcurrentDownloads;
        while (this.tasks.size < max) {
            const next = [...this.jobs.values()].find(j => j.status === 'queued');
            if (!next)
                break;
            const task = this.startJob(next);
            this.tasks.set(next.id, task);
            void task.finally(() => {
                this.tasks.delete(next.id);
                this.activeHandles.delete(next.id);
                this.cancelRequests.delete(next.id);
                this.trimHistory();
                this.processQueue();
            }).catch(error => { console.error('[queue] Falha interna:', classifyFailure(error, 'download').details.diagnosticId); });
        }
    }
    shutdown() {
        if (this.shutdownPromise)
            return this.shutdownPromise;
        this.stopping = true;
        this.shutdownPromise = (async () => {
            const results = await Promise.allSettled([...this.jobs.values()].filter(j => !terminal.has(j.status)).map(j => this.cancelJob(j.id)));
            if (results.some(r => r.status === 'rejected'))
                throw new Error('Encerramento de downloads não confirmado');
            await Promise.all([...this.tasks.values()]);
            if (this.activeHandles.size)
                throw new Error('Há processos ainda rastreados pela fila');
        })().catch(error => { this.shutdownPromise = undefined; throw error; });
        return this.shutdownPromise;
    }
    trimHistory() {
        const completed = [...this.jobs.values()].filter(j => terminal.has(j.status) && !this.tasks.has(j.id)).sort((a, b) => a.createdAt - b.createdAt);
        while (completed.length > 200) {
            const job = completed.shift();
            this.jobs.delete(job.id);
            this.lastProgressEmit.delete(job.id);
            this.emitEvent({ type: 'JOB_REMOVED', jobId: job.id, payload: { id: job.id } });
        }
    }
    async startJob(job) {
        let executionContext = {};
        job.progress.stage = 'downloading';
        this.transition(job, 'downloading');
        try {
            const config = this.deps.config();
            if (this.deps.identity) {
                executionContext = await this.deps.identity('yt-dlp');
                await this.deps.identity('ffmpeg');
            }
            const auth = await this.deps.validateAuth(this.contexts.get(job.id) || { mode: 'none' });
            const outputFolder = await this.deps.prepareDirectory(job.options.outputDir || config.defaultDownloadDir);
            if (this.cancelRequests.has(job.id) || this.stopping) {
                this.transition(job, 'cancelled');
                return;
            }
            job.outputPath = outputFolder;
            this.emitEvent({ type: 'STATUS', jobId: job.id, payload: { outputPath: outputFolder, progress: job.progress } });
            const { args } = buildYtdlpArgs(job.options, { config, auth, jobId: job.id, outputFolder });
            const handle = this.deps.run({ binaryPath: config.ytdlpPath, args,
                onStdoutLine: line => this.handleOutputLine(job.id, line),
                onStderrLine: line => this.handleOutputLine(job.id, line, true) });
            this.activeHandles.set(job.id, handle);
            const result = await handle.promise;
            this.activeHandles.delete(job.id);
            if (this.cancelRequests.has(job.id) || this.stopping) {
                job.error = undefined;
                job.errorDetails = undefined;
                this.transition(job, 'cancelled');
                return;
            }
            if (result.exitCode !== 0)
                throw Object.assign(new Error(result.stderr || `Ferramenta encerrou com código ${result.exitCode}`), { stderr: result.stderr });
            if (!job.outputFiles.length)
                throw new OperationError('EXTRACTOR_ERROR', 'download', 'Processo encerrou sem informar um arquivo final', 502);
            for (const file of job.outputFiles) {
                try {
                    await this.deps.verifyFile(file);
                }
                catch (error) {
                    throw new OperationError('FILESYSTEM_ERROR', 'download', String(error), 502);
                }
            }
            if (this.cancelRequests.has(job.id) || this.stopping) {
                job.error = undefined;
                job.errorDetails = undefined;
                this.transition(job, 'cancelled');
                return;
            }
            job.progress.percent = 100;
            job.progress.percentStr = '100%';
            this.transition(job, 'completed');
        }
        catch (error) {
            // The runner settles only after close. Preparation failures have no subprocess.
            this.activeHandles.delete(job.id);
            if (this.cancelRequests.has(job.id) || this.stopping) {
                job.error = undefined;
                job.errorDetails = undefined;
                this.transition(job, 'cancelled');
                return;
            }
            const failure = classifyFailure(error, job.status === 'processing' ? 'postprocessing' : 'download', executionContext);
            job.error = failure.message;
            job.errorDetails = failure.details;
            this.transition(job, 'error');
        }
    }
    handleOutputLine(id, raw, isError = false) {
        const job = this.jobs.get(id);
        if (!job)
            return;
        if (raw.startsWith('__INFO__')) {
            if (this.cancelRequests.has(id) || terminal.has(job.status))
                return;
            const metadata = parseMetadata(raw.slice(8), job.url);
            const entry = MediaEntrySchema.parse(metadata);
            const existing = job.metadata?.kind === 'collection' ? job.metadata.entries : job.metadata ? [job.metadata] : [];
            const entries = [...existing.filter(e => e.id !== entry.id), entry];
            job.metadata = entries.length > 1 ? { ...metadata, kind: 'collection', entries } : metadata;
            if (!job.options.customFilename)
                job.title = entries.length > 1 ? `Coleção (${entries.length} mídias)` : metadata.title;
            job.thumbnail ||= metadata.thumbnail;
            job.duration = entries.length === 1 ? metadata.duration : undefined;
            this.emitEvent({ type: 'STATUS', jobId: id, payload: { title: job.title, thumbnail: job.thumbnail, duration: job.duration, metadata: job.metadata } });
            return;
        }
        if (raw.startsWith('__FILE__')) {
            if (this.cancelRequests.has(id) || terminal.has(job.status))
                return;
            try {
                const value = JSON.parse(raw.slice(8));
                if (typeof value !== 'string' || !job.outputPath || !path.isAbsolute(value))
                    throw new Error('Caminho de saída inválido');
                const relative = path.relative(job.outputPath, value);
                if (!relative || relative.startsWith('..') || path.isAbsolute(relative))
                    throw new Error('Arquivo fora da pasta de saída');
                if (!job.outputFiles.includes(value))
                    job.outputFiles.push(value);
                this.emitEvent({ type: 'STATUS', jobId: id, payload: { outputFiles: job.outputFiles } });
            }
            catch {
                throw new OperationError('EXTRACTOR_ERROR', 'download', 'Marcador de arquivo final inválido', 502);
            }
            return;
        }
        if (!raw.includes(PROGRESS_PREFIX) && !raw.startsWith('__POSTPROCESS__')) {
            const line = redactDiagnostic(raw).slice(0, 2000);
            job.logs.push(line);
            job.logs = job.logs.slice(-200);
            this.emitEvent({ type: 'LOG', jobId: id, payload: { line, isError } });
        }
        if (this.cancelRequests.has(id) || terminal.has(job.status))
            return;
        const previousStage = job.progress.stage;
        const { progress, stage } = parseProgressLine(raw, job.progress);
        if (!progress && !stage)
            return;
        if (progress)
            job.progress = { ...job.progress, ...progress };
        if (stage)
            job.progress.stage = stage;
        const stageChanged = previousStage !== job.progress.stage;
        if (stageChanged) {
            if (['merging', 'extracting_audio', 'processing'].includes(job.progress.stage))
                this.transition(job, 'processing');
            else if (job.progress.stage === 'downloading')
                this.transition(job, 'downloading');
        }
        const now = Date.now();
        if (stageChanged || now - (this.lastProgressEmit.get(id) || 0) >= 250) {
            this.lastProgressEmit.set(id, now);
            this.emitEvent({ type: 'PROGRESS', jobId: id, payload: { progress: job.progress, status: job.status } });
        }
    }
}
export const queueService = new QueueService();
