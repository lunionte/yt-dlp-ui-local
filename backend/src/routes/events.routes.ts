import { Router } from 'express';
import { queueService, type QueueService } from '../services/queue.service.js';
import type { SSEEventData } from '@ytdlp/shared';
import { OperationError } from '../services/error.service.js';
export function createEventsRouter(queue: QueueService = queueService): Router {
  const router = Router();
  let clients = 0;
  router.get('/', (req, res) => {
    if (clients >= 20) throw new OperationError('CAPACITY', 'system', 'Limite de clientes SSE', 503);
    clients++;
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write(': connected\n\n');
    let closed = false;
    const cleanup = () => {
      if (closed) return; closed = true; clients--;
      clearInterval(heartbeat); queue.off('event', onEvent);
    };
    const write = (data: string) => {
      if (!closed && !res.write(data)) { cleanup(); res.destroy(); }
    };
    const onEvent = (event: SSEEventData) => write(`id: ${event.sequence}\ndata: ${JSON.stringify(event)}\n\n`);
    const heartbeat = setInterval(() => write(': ping\n\n'), 20000);
    queue.on('event', onEvent);
    req.on('close', cleanup);
    res.on('error', cleanup);
  });
  return router;
}
export default createEventsRouter();
