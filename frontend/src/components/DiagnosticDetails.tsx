import React, { useEffect, useId, useRef, useState } from 'react';
import { z } from 'zod';
import { MediaErrorSchema } from '@ytdlp/shared';
import { apiRequest, errorMessage } from '../utils/api.js';
import { Button, Modal } from './ui.js';
import { PagedText } from './PagedText.js';
const schema = z.object({ id: z.string(), error: MediaErrorSchema, detail: z.string(), createdAt: z.number(), context: z.record(z.union([z.string(), z.number(), z.boolean()])) });
export const DiagnosticDetails: React.FC<{ id?: string }> = ({ id }) => {
  const [detail, setDetail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const opener = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { setDetail(null); setOpen(false); }, [id]);
  if (!id) return null;
  const load = async () => {
    setLoading(true);
    try {
      const diagnostic = await apiRequest(`/api/system/diagnostics/${encodeURIComponent(id)}`, schema);
      setDetail(`${diagnostic.error.code} • ${diagnostic.error.phase}\n${diagnostic.detail || 'Sem detalhes adicionais.'}\n${JSON.stringify(diagnostic.context, null, 2)}`);
      setOpen(true);
    } catch (error) { setDetail(errorMessage(error)); setOpen(true); }
    finally { setLoading(false); }
  };
  return <span className="block mt-3">
    <Button aria-expanded={open} aria-controls={panelId} onClick={event => { opener.current = event.currentTarget; if (detail) setOpen(true); else void load(); }} disabled={loading}>{loading ? 'Carregando…' : 'Ver diagnóstico'}</Button>
    {open && detail && <Modal fill returnFocus={opener.current} title="Diagnóstico da tentativa" onClose={() => setOpen(false)} footer={<Button onClick={() => setOpen(false)}>Fechar</Button>}><div id={panelId} className="ui-log-layout"><PagedText dark={false} lines={detail.split('\n')} label="Conteúdo do diagnóstico" /></div></Modal>}
  </span>;
};
