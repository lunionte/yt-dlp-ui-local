import { Router } from 'express';
import { queueService } from '../services/queue.service.js';
const router = Router();
router.get('/', (req, res) => {
    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // Evita buffering caso haja proxy reverso
    });
    // Envia comentário inicial para estabelecer conexão
    res.write(': connected\n\n');
    const onEvent = (data) => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };
    queueService.on('event', onEvent);
    // Heartbeat a cada 20 segundos para evitar timeout do navegador
    const heartbeat = setInterval(() => {
        res.write(': ping\n\n');
    }, 20000);
    req.on('close', () => {
        clearInterval(heartbeat);
        queueService.off('event', onEvent);
        res.end();
    });
});
export default router;
