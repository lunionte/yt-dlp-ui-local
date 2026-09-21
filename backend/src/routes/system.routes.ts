import { Router, Request, Response } from 'express';
import { loadConfig, saveConfig, checkToolVersion } from '../config/paths.js';
import { UpdateConfigSchema } from '../schemas/download.schema.js';

const router = Router();

router.get('/check', async (_req: Request, res: Response) => {
  const config = loadConfig();

  const [ytdlp, ffmpeg, ffprobe] = await Promise.all([
    checkToolVersion(config.ytdlpPath, '--version'),
    checkToolVersion(config.ffmpegPath, '-version'),
    checkToolVersion(config.ffprobePath, '-version'),
  ]);

  res.json({
    config,
    tools: {
      ytdlp,
      ffmpeg,
      ffprobe,
    },
  });
});

router.post('/config', (req: Request, res: Response) => {
  const result = UpdateConfigSchema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: result.error.errors[0].message });
    return;
  }

  const updated = saveConfig(result.data);
  res.json({ success: true, config: updated });
});

export default router;
