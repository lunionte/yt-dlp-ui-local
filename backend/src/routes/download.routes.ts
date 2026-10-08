import { Router } from 'express';
import { CreateDownloadSchema } from '@ytdlp/shared';
import { queueService, type QueueService } from '../services/queue.service.js';
import { OperationError } from '../services/error.service.js';
import { asyncRoute } from '../utils/http.utils.js';
export function createDownloadRouter(queue: QueueService = queueService): Router {
  const router = Router();
  router.get('/', (_req, res) => res.json(queue.getSnapshot()));
  router.get('/:id', (req, res) => {
    const job = queue.getJob(req.params.id);
    if (!job) throw new OperationError('UNAVAILABLE', 'system', 'Job inexistente', 404);
    res.json(job);
  });
  router.post('/', asyncRoute(async (req, res) => {
    const parsed = CreateDownloadSchema.safeParse(req.body);
    if (!parsed.success) throw new OperationError('VALIDATION_ERROR', 'download', parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('\n'), 400);
    const job = await queue.addJob(parsed.data);
    res.status(201).json(job);
  }));
  router.post('/:id/cancel', asyncRoute(async (req, res) => {
    if (!queue.getJob(req.params.id)) throw new OperationError('UNAVAILABLE', 'system', 'Job inexistente', 404);
    if (!await queue.cancelJob(req.params.id)) throw new OperationError('CONFLICT', 'download', 'Job já finalizado', 409);
    res.json({ success: true });
  }));
  router.delete('/:id', asyncRoute(async (req, res) => {
    if (!await queue.deleteJob(req.params.id)) throw new OperationError('UNAVAILABLE', 'system', 'Job inexistente', 404);
    res.json({ success: true });
  }));
  return router;
}
export default createDownloadRouter();
