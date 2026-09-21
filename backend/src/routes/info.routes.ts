import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { fetchVideoInfo } from '../services/ytdlp.service.js';

const router = Router();

const InfoQuerySchema = z.object({
  url: z.string().url('URL inválida').min(1, 'A URL é obrigatória'),
});

router.post('/', async (req: Request, res: Response) => {
  const result = InfoQuerySchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0].message });
    return;
  }

  try {
    const info = await fetchVideoInfo(result.data.url);
    res.json(info);
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Erro ao obter informações do vídeo' });
  }
});

export default router;
