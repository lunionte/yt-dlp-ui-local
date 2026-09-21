import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import infoRoutes from './routes/info.routes.js';
import downloadRoutes from './routes/download.routes.js';
import eventsRoutes from './routes/events.routes.js';
import systemRoutes from './routes/system.routes.js';
dotenv.config();
const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
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
const frontendDist = path.resolve(process.cwd(), 'frontend', 'dist');
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
app.use((err, _req, res, _next) => {
    console.error('Erro na API:', err);
    res.status(500).json({ error: err.message || 'Erro interno do servidor' });
});
const server = app.listen(PORT, () => {
    console.log(`[yt-dlp-ui] Backend rodando na porta ${PORT} (http://localhost:${PORT})`);
});
// Encerramento gracioso
const shutdown = () => {
    console.log('Encerrando servidor...');
    server.close(() => {
        process.exit(0);
    });
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
