import { Router } from 'express';
import { BrowseSchema, OpenFolderSchema, UpdateConfigSchema } from '@ytdlp/shared';
import { loadConfig, saveConfig, checkToolVersion } from '../config/paths.js';
import { selectPathViaDialog, openFolderInExplorer } from '../services/dialog.service.js';
import { queueService } from '../services/queue.service.js';
import { requireDirectory } from '../services/path.service.js';
import { OperationError, getDiagnostic } from '../services/error.service.js';
import { asyncRoute } from '../utils/http.utils.js';
const router = Router();
router.get('/check', asyncRoute(async (_req, res) => {
    const config = loadConfig();
    const [ytdlp, ffmpeg, ffprobe] = await Promise.all([checkToolVersion(config.ytdlpPath), checkToolVersion(config.ffmpegPath, '-version'), checkToolVersion(config.ffprobePath, '-version')]);
    res.json({ config, tools: { ytdlp, ffmpeg, ffprobe: { ...ffprobe, optional: true } } });
}));
router.get('/diagnostics/:id', (req, res) => {
    const diagnostic = getDiagnostic(req.params.id);
    if (!diagnostic)
        throw new OperationError('UNAVAILABLE', 'system', 'Diagnóstico expirou ou não existe', 404);
    res.json(diagnostic);
});
router.post('/config', asyncRoute(async (req, res) => {
    const parsed = UpdateConfigSchema.safeParse(req.body);
    if (!parsed.success)
        throw new OperationError('VALIDATION_ERROR', 'system', 'Preferências inválidas', 400);
    const config = await saveConfig(parsed.data);
    queueService.processQueue();
    res.json({ success: true, config });
}));
router.post('/browse', asyncRoute(async (req, res) => {
    const parsed = BrowseSchema.safeParse(req.body);
    if (!parsed.success)
        throw new OperationError('VALIDATION_ERROR', 'system', 'Opções de diálogo inválidas', 400);
    const options = parsed.data;
    // A file dialog can start at a file; otherwise all paths are existing directories.
    if (options.defaultPath && options.type === 'folder')
        await requireDirectory(options.defaultPath);
    res.json(await selectPathViaDialog(options));
}));
router.post('/open-folder', asyncRoute(async (req, res) => {
    const parsed = OpenFolderSchema.safeParse(req.body);
    if (!parsed.success)
        throw new OperationError('VALIDATION_ERROR', 'system', 'Caminho inválido', 400);
    const folder = await requireDirectory(parsed.data.folderPath || loadConfig().defaultDownloadDir);
    const result = await openFolderInExplorer(folder);
    if (!result.success)
        throw new OperationError('FILESYSTEM_ERROR', 'system', result.error || 'Falha ao abrir pasta', 502);
    res.json(result);
}));
export default router;
