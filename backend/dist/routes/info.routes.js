import { Router } from 'express';
import { z } from 'zod';
import { fetchVideoInfo } from '../services/ytdlp.service.js';
import { normalizeMediaUrl } from '../utils/url.utils.js';
const router = Router();
const InfoQuerySchema = z.object({
    url: z.string().min(1, 'A URL é obrigatória').transform(normalizeMediaUrl).pipe(z.string().url('URL inválida')),
});
router.post('/', async (req, res) => {
    const result = InfoQuerySchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ error: result.error.errors[0].message });
        return;
    }
    const controller = new AbortController();
    res.on('close', () => {
        if (!res.writableEnded)
            controller.abort();
    });
    try {
        const info = await fetchVideoInfo(result.data.url, controller.signal);
        if (res.destroyed)
            return;
        res.json(info);
    }
    catch (err) {
        if (controller.signal.aborted || res.destroyed)
            return;
        res.status(500).json({ error: err.message || 'Erro ao obter informações do vídeo' });
    }
});
export default router;
