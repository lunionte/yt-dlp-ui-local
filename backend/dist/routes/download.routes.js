import { Router } from 'express';
import { CreateDownloadSchema } from '../schemas/download.schema.js';
import { queueService } from '../services/queue.service.js';
const router = Router();
// Listar downloads
router.get('/', (_req, res) => {
    const jobs = queueService.getJobs();
    res.json(jobs);
});
// Detalhes de um download
router.get('/:id', (req, res) => {
    const job = queueService.getJob(req.params.id);
    if (!job) {
        res.status(404).json({ error: 'Download não encontrado' });
        return;
    }
    res.json(job);
});
// Iniciar/enfileirar download
router.post('/', async (req, res) => {
    const result = CreateDownloadSchema.safeParse(req.body);
    if (!result.success) {
        res.status(400).json({ error: result.error.errors[0].message, details: result.error.format() });
        return;
    }
    const initialTitle = typeof req.body.title === 'string' ? req.body.title : undefined;
    const job = await queueService.addJob(result.data, initialTitle);
    res.status(201).json(job);
});
// Cancelar download em andamento
router.post('/:id/cancel', async (req, res) => {
    const success = await queueService.cancelJob(req.params.id);
    if (!success) {
        res.status(404).json({ error: 'Download não encontrado ou já finalizado' });
        return;
    }
    res.json({ success: true, message: 'Download cancelado com sucesso' });
});
// Remover download da lista
router.delete('/:id', (req, res) => {
    const success = queueService.deleteJob(req.params.id);
    if (!success) {
        res.status(404).json({ error: 'Download não encontrado' });
        return;
    }
    res.json({ success: true });
});
export default router;
