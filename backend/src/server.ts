import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import type { Server } from 'node:http';
import { createInfoRouter } from './routes/info.routes.js';
import { createDownloadRouter } from './routes/download.routes.js';
import { createEventsRouter } from './routes/events.routes.js';
import systemRoutes from './routes/system.routes.js';
import { queueService, type QueueService } from './services/queue.service.js';
import { shutdownMetadata } from './services/ytdlp.service.js';
import { shutdownProcesses } from './services/runner.service.js';
import { OperationError } from './services/error.service.js';
import { errorHandler } from './utils/http.utils.js';
export { requireDirectory } from './services/path.service.js';
dotenv.config();
const DEFAULT_PORT = Number(process.env.PORT || 3001);
export function createApp(queue: QueueService = queueService, fetchInfo?: Parameters<typeof createInfoRouter>[0]) {
  const app = express();
  app.use((req, _res, next) => {
    const origin = req.headers.origin;
    try {
      const host = new URL(`http://${req.headers.host}`);
      if (!['127.0.0.1', 'localhost'].includes(host.hostname) || host.username || host.password) throw new Error('Host inválido');
    } catch { next(new OperationError('ACCESS_DENIED', 'system', 'Host não autorizado', 403)); return; }
    if (origin) {
      try {
        const url = new URL(origin);
        const sameOrigin = origin === `http://${req.headers.host}`;
        const dev = process.env.NODE_ENV !== 'production' && ['localhost', '127.0.0.1'].includes(url.hostname) && url.protocol === 'http:' && url.port === '5173';
        if (!sameOrigin && !dev) throw new Error('Origem não autorizada');
      } catch { next(new OperationError('ACCESS_DENIED', 'system', 'Origem HTTP não autorizada', 403)); return; }
    } else if (req.headers['sec-fetch-site'] === 'cross-site') {
      next(new OperationError('ACCESS_DENIED', 'system', 'Requisição cross-site não autorizada', 403)); return;
    }
    if (queue.isStopping()) { next(new OperationError('SHUTTING_DOWN', 'system', '', 503)); return; }
    next();
  });
  app.use(cors({ origin: true, credentials: false }));
  app.use(express.json({ limit: '64kb' }));
  app.use('/api/info', createInfoRouter(fetchInfo));
  app.use('/api/downloads/events', createEventsRouter(queue));
  app.use('/api/downloads', createDownloadRouter(queue));
  app.use('/api/system', systemRoutes);
  const frontend = path.resolve(process.env.APP_ROOT || process.cwd(), 'frontend/dist');
  if (fs.existsSync(frontend)) {
    app.use(express.static(frontend));
    app.get('*', (req, res, next) => req.path.startsWith('/api') ? next() : res.sendFile(path.join(frontend, 'index.html')));
  }
  app.use(errorHandler);
  return app;
}
let stopPromise: Promise<void> | undefined;
export function stopServer(server?: Server): Promise<void> {
  if (stopPromise) return stopPromise;
  const closeServer = server ? new Promise<void>((resolve, reject) => {
    server.close(error => error && (error as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING' ? reject(error) : resolve());
    server.closeAllConnections();
  }) : Promise.resolve();
  const queueStop = queueService.shutdown();
  stopPromise = Promise.all([closeServer, queueStop, shutdownMetadata(), shutdownProcesses()]).then(() => {}).catch(error => { stopPromise = undefined; throw error; });
  return stopPromise;
}
export function startServer(port = DEFAULT_PORT): Server {
  const server = createApp().listen(port, '127.0.0.1');
  server.once('listening', () => {
    const address = server.address();
    console.log(`[yt-dlp-ui] Backend em http://127.0.0.1:${typeof address === 'object' && address ? address.port : port}`);
  });
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href && !process.env.ELECTRON) {
  const server = startServer();
  const shutdown = () => { void stopServer(server).then(() => { process.exitCode = 0; }).catch(error => { console.error('[shutdown]', error.message); process.exitCode = 1; }); };
  process.once('SIGINT', shutdown); process.once('SIGTERM', shutdown);
  server.on('error', error => { console.error('[server]', error.message); shutdown(); });
}
