import { useEffect, useRef } from 'react';
import type { DownloadJob } from '@ytdlp/shared';
import { StatusBadge } from './ui.js';
import { DownloadItem } from './DownloadItem.js';

export function DownloadsPanel({ jobs, revealId, onCancel, onDelete }: {
  revealId?: string;
  jobs: DownloadJob[]; onCancel: (id: string) => Promise<boolean>; onDelete: (id: string) => Promise<boolean>;
}) {
  const list = useRef<HTMLOListElement>(null);
  const revealed = useRef<string | undefined>(undefined);
  const ordered = jobs.map((job, index) => ({ job, index })).sort((a, b) => a.job.createdAt - b.job.createdAt || b.index - a.index);
  useEffect(() => {
    const area = list.current;
    if (!area || !revealId || revealed.current === revealId || !area.clientHeight) return;
    const item = Array.from(area.children).find(child => (child as HTMLElement).dataset.jobId === revealId);
    if (!item) return; // SSE can arrive after the enqueue response.
    const box = item.getBoundingClientRect(), viewport = area.getBoundingClientRect();
    if (box.bottom > viewport.bottom) area.scrollTop += box.bottom - viewport.bottom;
    else if (box.top < viewport.top) area.scrollTop += box.top - viewport.top;
    revealed.current = revealId;
  }, [jobs, revealId]);
  const active = jobs.filter(job => ['downloading', 'processing', 'cancelling'].includes(job.status)).length;
  return <section className="glass-card ui-downloads-pane" aria-labelledby="jobs-heading">
    <header className="ui-group">
      <div className="ui-section-header"><h2 id="jobs-heading">Downloads ({jobs.length})</h2>{active > 0 && <StatusBadge tone="active">{active} em andamento</StatusBadge>}</div>
    </header>
    {jobs.length ? <ol ref={list} className="ui-downloads-body" aria-label="Lista de downloads" tabIndex={0}>
      {ordered.map(({ job }) => <li key={job.id} data-job-id={job.id}><DownloadItem job={job} onCancel={onCancel} onDelete={onDelete} /></li>)}
    </ol> : <div className="ui-empty-downloads"><h3>Sua fila de downloads</h3><p className="ui-help">Ao iniciar um download, acompanhe o progresso e acesse os arquivos por aqui.</p></div>}
  </section>;
}
