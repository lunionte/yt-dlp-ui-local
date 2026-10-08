import { useEffect, useMemo, useRef, useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { PagedText } from './PagedText.js';
import { Button, MediaTitle, Modal, Notice } from './ui.js';

export function LogViewer({ logs, title, isOpen, onClose }: {
  logs: string[]; title?: string; isOpen: boolean; onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [showTitle, setShowTitle] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const visibleLogs = useMemo(() => logs.filter(line => !line.startsWith('__PROGRESS__')), [logs]);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  useEffect(() => {
    setCopied(false); setCopyError(null);
    if (timerRef.current) clearTimeout(timerRef.current);
  }, [isOpen]);
  const copy = async () => {
    setCopyError(null); setCopied(false);
    try {
      await navigator.clipboard.writeText(visibleLogs.join('\n'));
      setCopied(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch { setCopyError('Não foi possível copiar. Verifique a permissão da área de transferência.'); }
  };
  if (!isOpen) return null;
  return <Modal wide fill title="Logs do download" onClose={onClose} footer={<Button onClick={onClose}>Fechar</Button>}>
    <div className="ui-log-layout">
      {title && <div className="ui-log-title"><MediaTitle title={title} /></div>}
      <div className="ui-terminal-actions">
        <p className="ui-meta" role="status">{`${visibleLogs.length} ${visibleLogs.length === 1 ? 'linha registrada' : 'linhas registradas'}`}</p>
        <div className="ui-actions">
          {title && <Button className="ui-short-details" onClick={() => setShowTitle(true)}>Título da mídia</Button>}
          <Button onClick={copy} disabled={visibleLogs.length === 0}>{copied ? <Check /> : <Copy />}{copied ? 'Copiado' : 'Copiar logs'}</Button>
        </div>
      </div>
      {copyError && <Modal title="Falha ao copiar" onClose={() => setCopyError(null)} footer={<Button onClick={() => setCopyError(null)}>OK</Button>}><Notice>{copyError}</Notice></Modal>}
      {showTitle && title && <Modal fill title="Título da mídia" onClose={() => setShowTitle(false)} footer={<Button onClick={() => setShowTitle(false)}>Fechar</Button>}><PagedText dark={false} prose lines={[title]} label="Título completo" /></Modal>}
      <PagedText lines={visibleLogs} label="Conteúdo dos logs" />
    </div>
  </Modal>;
}
