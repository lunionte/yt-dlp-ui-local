import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import type { Server } from 'node:http';
import infoRoutes from './routes/info.routes.js';
import downloadRoutes from './routes/download.routes.js';
import eventsRoutes from './routes/events.routes.js';
import systemRoutes from './routes/system.routes.js';

dotenv.config();

const app = express();
const DEFAULT_PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;

// Diretório base: APP_ROOT (Electron) ou process.cwd() (modo web)
const baseDir = process.env.APP_ROOT || process.cwd();

// Middlewares
app.use(cors({
  origin: true,
  credentials: true,
}));
app.use(express.json());

// Rotas da API
app.use('/api/info', infoRoutes);
app.use('/api/downloads/events', eventsRoutes);
app.use('/api/downloads', downloadRoutes);
app.use('/api/system', systemRoutes);

// Servir frontend compilado (quando em produção ou executado standalone)
const frontendDist = path.resolve(baseDir, 'frontend', 'dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    res.sendFile(path.resolve(frontendDist, 'index.html'));
  });
}

// Tratamento básico de erros
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Erro na API:', err);
  res.status(500).json({ error: err.message || 'Erro interno do servidor' });
});

/**
 * Inicia o servidor Express na porta especificada.
 * Exportado para uso pelo Electron main process.
 */
export function startServer(port?: number): Server {
  const p = port ?? DEFAULT_PORT;
  const server = app.listen(p, () => {
    console.log(`[yt-dlp-ui] Backend rodando na porta ${p} (http://localhost:${p})`);
  });

  // Encerramento gracioso (apenas no modo web standalone)
  if (!process.env.ELECTRON) {
    const shutdown = () => {
      console.log('Encerrando servidor...');
      server.close(() => {
        process.exit(0);
      });
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  }

  return server;
}

// Auto-start apenas no modo web (quando NÃO está dentro do Electron)
if (!process.env.ELECTRON) {
  startServer();
}
