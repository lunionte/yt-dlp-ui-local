import { useRef, useState } from 'react';
import { FolderOpen, Terminal, Trash2, Ban, Info, AlertCircle } from 'lucide-react';
import type { DownloadJob, DownloadStage } from '@ytdlp/shared';
import { openDownloadFolder } from '../utils/system.js';
import { errorMessage } from '../utils/api.js';
import { Button, MediaTitle, Notice, StatusBadge, Modal } from './ui.js';
import { LogViewer } from './LogViewer.js';
import { DiagnosticDetails } from './DiagnosticDetails.js';
import { PagedText } from './PagedText.js';

const stageLabels: Record<DownloadStage, string> = {
  queued: 'Na fila', downloading: 'Baixando mídia', merging: 'Unindo áudio e vídeo',
  extracting_audio: 'Extraindo áudio', processing: 'Processando mídia',
  completed: 'Concluído', cancelling: 'Cancelando…', cancelled: 'Cancelado', error: 'Falhou',
};
function available(value: string | undefined) {
  return value && !['NA', 'N/A', '--', '--:--', 'UNKNOWN'].includes(value.toUpperCase()) ? value : null;
}

export function DownloadItem({ job, onCancel, onDelete }: {
  job: DownloadJob; onCancel: (id: string) => Promise<boolean>; onDelete: (id: string) => Promise<boolean>;
}) {
  const [showError, setShowError] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [folderError, setFolderError] = useState<string | null>(null);
  const [openingFolder, setOpeningFolder] = useState(false);
  const folderOpener = useRef<HTMLElement | null>(null);
  const isCancelling = job.status === 'cancelling' || cancelling;
  const isCompleted = job.status === 'completed';
  const isTerminal = ['completed', 'cancelled', 'error'].includes(job.status);
  const isActive = job.status === 'downloading';
  const isProcessing = job.status === 'processing';
  const stage = isCancelling ? 'cancelling' : isTerminal || job.status === 'queued' ? job.status : job.progress.stage;
  const tone = isCompleted ? 'success' : job.status === 'error' ? 'danger' : isCancelling || job.status === 'queued' ? 'warning' : job.status === 'cancelled' ? 'neutral' : 'active';
  const transferred = available(job.progress.downloadedBytes);
  const total = available(job.progress.totalBytes);
  const eta = available(job.progress.eta);
  const speed = available(job.progress.speed);
  const openFolder = async () => {
    folderOpener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const folder = job.outputPath || job.options.outputDir;
    if (!folder) return;
    setOpeningFolder(true); setFolderError(null);
    try { await openDownloadFolder(folder); } catch (error) { setFolderError(errorMessage(error)); }
    finally { setOpeningFolder(false); }
  };
  const cancel = async () => {
    setCancelling(true);
    try { await onCancel(job.id); } finally { setCancelling(false); }
  };
  const format = job.options.mode === 'video'
    ? `Vídeo · ${job.options.videoResolution === 'best' ? 'Melhor disponível' : job.options.videoResolution} · ${job.options.videoContainer.toUpperCase()}`
    : `Áudio · ${job.options.audioFormat.toUpperCase()} · ${job.options.audioQuality === 'best' ? 'Melhor disponível' : job.options.audioQuality.replace('k', ' kbps')}`;

  return <article className="glass-card ui-panel ui-download" aria-label={`Download: ${job.title}`}>
    <div className="ui-download-heading">
      {job.thumbnail && <img src={job.thumbnail} alt="" />}
      <div className="ui-download-content ui-group">
        <MediaTitle title={job.title} heading />
        <div className="ui-meta-row"><span className="ui-meta">{format}</span><StatusBadge tone={tone}>{stageLabels[stage]}</StatusBadge></div>
      </div>
    </div>
    {isActive && !isCancelling && <div>
      <div className="ui-progress-label"><span>Progresso da mídia atual</span><strong className="font-mono">{job.progress.percent.toFixed(1)}%</strong></div>
      <div className="ui-progress" role="progressbar" aria-label="Progresso da mídia atual" aria-valuemin={0} aria-valuemax={100} aria-valuenow={job.progress.percent}>
        <div className="ui-progress-fill" style={{ width: `${job.progress.percent}%` }} />
      </div>
      <div className="ui-metrics mt-3">
        {speed && <span>Velocidade: <strong className="font-mono">{speed}</strong></span>}
        <span>Transferido: <strong className="font-mono">{transferred || '0 B'}{total ? ` de ${total}` : ''}</strong></span>
        <span>Tempo restante: <strong className={eta ? 'font-mono' : ''}>{eta || 'Calculando…'}</strong></span>
      </div>
    </div>}
    {isProcessing && !isCancelling && <div>
      <p className="ui-meta mb-2">Preparando os arquivos finais…</p>
      <div className="ui-progress" role="progressbar" aria-label="Processando mídia"><div className="ui-progress-fill ui-progress-indeterminate" /></div>
    </div>}
    {job.status === 'queued' && <p className="ui-meta">Aguardando uma vaga para iniciar.</p>}
    {isCancelling && <p className="ui-meta" role="status">Aguardando o encerramento do processo.</p>}
    {(isCompleted || job.outputFiles.length > 0) && <div className="ui-metrics">
      <span>{job.outputFiles.length} {job.outputFiles.length === 1 ? 'arquivo' : 'arquivos'} {isCompleted ? (job.outputFiles.length === 1 ? 'salvo' : 'salvos') : (job.outputFiles.length === 1 ? 'disponível' : 'disponíveis')}</span>
      {isCompleted && transferred && <span>{job.outputFiles.length > 1 ? 'Última mídia transferida' : 'Volume transferido'}: <strong className="font-mono">{transferred}</strong></span>}
    </div>}

    <div className="ui-actions ui-download-actions">
      <Button title="Ver logs" onClick={() => setShowLogs(true)}><Terminal />Ver logs</Button>
      <div className="ui-download-icon-actions">
        {job.error && <Button iconOnly variant="danger" title="Detalhes do erro" aria-label="Detalhes do erro" onClick={() => setShowError(true)}><AlertCircle /></Button>}
        <Button iconOnly title="Detalhes do download" aria-label="Detalhes do download" onClick={() => setShowDetails(true)}><Info /></Button>
        {!isTerminal && <Button iconOnly variant="danger" title={isCancelling ? 'Cancelando…' : 'Cancelar'} aria-label={isCancelling ? 'Cancelando…' : 'Cancelar'} onClick={cancel} disabled={isCancelling}><Ban /></Button>}
        {(isCompleted || job.outputFiles.length > 0) && <Button iconOnly title="Abrir pasta" aria-label={openingFolder ? 'Abrindo…' : 'Abrir pasta'} onClick={openFolder} disabled={openingFolder}><FolderOpen /></Button>}
        {isTerminal && <Button iconOnly variant="danger" title="Remover download da lista" onClick={() => void onDelete(job.id)} aria-label="Remover download da lista"><Trash2 /></Button>}
      </div>
    </div>
    {showError && <Modal fill title="Erro no download" onClose={() => setShowError(false)} footer={<Button onClick={() => setShowError(false)}>Fechar</Button>}><PagedText dark={false} prose label="Mensagem do erro" lines={[job.errorDetails?.message || job.error || 'Falha no download.']} /><DiagnosticDetails id={job.errorDetails?.diagnosticId} /></Modal>}
    {folderError && <Modal returnFocus={folderOpener.current} title="Não foi possível abrir a pasta" onClose={() => setFolderError(null)} footer={<Button onClick={() => setFolderError(null)}>Fechar</Button>}><Notice>{folderError}</Notice></Modal>}
    {showDetails && <Modal fill title="Detalhes do download" onClose={() => setShowDetails(false)} footer={<Button onClick={() => setShowDetails(false)}>Fechar</Button>}><PagedText dark={false} prose label="Detalhes da transferência" lines={[
      job.title, format, `Estado: ${stageLabels[stage]}`,
      ...(isActive ? [`Velocidade: ${speed || 'Calculando…'}`, `Transferido: ${transferred || '0 B'}${total ? ` de ${total}` : ''}`, `Tempo restante: ${eta || 'Calculando…'}`] : []),
      ...(isCompleted ? [`${job.outputFiles.length} ${job.outputFiles.length === 1 ? 'arquivo salvo' : 'arquivos salvos'}`, ...(transferred ? [`Volume transferido: ${transferred}`] : [])] : []),
      ...job.outputFiles,
    ]} /></Modal>}
    <LogViewer logs={job.logs} title={job.title} isOpen={showLogs} onClose={() => setShowLogs(false)} />
  </article>;
}
