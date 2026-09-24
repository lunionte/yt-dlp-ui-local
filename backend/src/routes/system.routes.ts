import { Router, Request, Response } from 'express';
import { loadConfig, saveConfig, checkToolVersion } from '../config/paths.js';
import { UpdateConfigSchema } from '../schemas/download.schema.js';
import { selectPathViaDialog, openFolderInExplorer } from '../services/dialog.service.js';

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
      ytdlp: { ...ytdlp, embedded: true },
      ffmpeg: { ...ffmpeg, embedded: true },
      ffprobe: { ...ffprobe, embedded: true },
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

router.post('/browse', async (req: Request, res: Response) => {
  const { type, title, defaultPath, filter } = req.body;
  const result = await selectPathViaDialog({
    type: type === 'file' ? 'file' : 'folder',
    title: typeof title === 'string' ? title : undefined,
    defaultPath: typeof defaultPath === 'string' ? defaultPath : undefined,
    filter: typeof filter === 'string' ? filter : undefined,
  });

  res.json(result);
});

router.post('/open-folder', async (req: Request, res: Response) => {
  const config = loadConfig();
  const folderPath = req.body.folderPath || config.defaultDownloadDir;

  if (!folderPath) {
    res.status(400).json({ error: 'Caminho da pasta não informado' });
    return;
  }

  const result = await openFolderInExplorer(folderPath);
  if (!result.success) {
    res.status(500).json(result);
    return;
  }

  res.json(result);
});

export default router;

