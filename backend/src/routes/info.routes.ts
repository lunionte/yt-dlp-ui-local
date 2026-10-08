import { Router } from 'express';
import { InfoQuerySchema } from '@ytdlp/shared';
import { fetchVideoInfo } from '../services/ytdlp.service.js';
import { OperationError } from '../services/error.service.js';
import { asyncRoute } from '../utils/http.utils.js';
export function createInfoRouter(fetchInfo = fetchVideoInfo): Router {
  const router = Router();
  router.post('/', asyncRoute(async (req, res) => {
    const parsed = InfoQuerySchema.safeParse(req.body);
    if (!parsed.success) throw new OperationError('VALIDATION_ERROR', 'metadata', 'URL ou contexto inválido', 400);
    const controller = new AbortController();
    const closed = () => { if (!res.writableEnded) controller.abort(); };
    res.on('close', closed);
    try {
      const info = await fetchInfo(parsed.data.url, controller.signal, parsed.data.auth);
      if (!res.destroyed) res.json(info);
    } catch (error) {
      if (!controller.signal.aborted && !res.destroyed) throw error;
    } finally { res.off('close', closed); }
  }));
  return router;
}
export default createInfoRouter();
