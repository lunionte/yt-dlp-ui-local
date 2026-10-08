import React, { useEffect, useState } from 'react';
import { z } from 'zod';
import { MediaErrorSchema } from '@ytdlp/shared';
import { apiRequest, errorMessage } from '../utils/api.js';
const schema = z.object({ id: z.string(), error: MediaErrorSchema, detail: z.string(), createdAt: z.number(), context: z.record(z.union([z.string(), z.number(), z.boolean()])) });
export const DiagnosticDetails: React.FC<{ id?: string }> = ({ id }) => {
  const [detail, setDetail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => { setDetail(null); }, [id]);
  if (!id) return null;
  const load = async () => {
    setLoading(true);
    try {
      const diagnostic = await apiRequest(`/api/system/diagnostics/${encodeURIComponent(id)}`, schema);
      setDetail(`${diagnostic.error.code} • ${diagnostic.error.phase}\n${diagnostic.detail || 'Sem detalhes adicionais.'}\n${JSON.stringify(diagnostic.context, null, 2)}`);
    } catch (error) { setDetail(errorMessage(error)); }
    finally { setLoading(false); }
  };
  return <span className="block mt-2 text-xs">
    <button type="button" className="glass-button px-3 py-1.5" onClick={() => detail ? setDetail(null) : void load()} disabled={loading}>{loading ? 'Carregando...' : detail ? 'Ocultar diagnóstico' : 'Ver diagnóstico'}</button>
    {detail && <code className="block mt-2 whitespace-pre-wrap break-words max-h-48 overflow-auto font-mono">{detail}</code>}
  </span>;
};
