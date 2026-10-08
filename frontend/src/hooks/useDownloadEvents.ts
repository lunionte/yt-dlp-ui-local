import { useState, useEffect, useCallback } from 'react';
import { z } from 'zod';
import { JobsSnapshotSchema, SSEEventSchema, applyJobEvent, type DownloadJob, type SSEEventData } from '@ytdlp/shared';
import { apiRequest, errorMessage } from '../utils/api.js';
import { reconcileSnapshot } from '../utils/reconcile.js';

export function useDownloadEvents() {
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [connected, setConnected] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  useEffect(() => {
    let disposed = false, generation = 0;
    let controller: AbortController | undefined;
    let buffer: SSEEventData[] | undefined;
    const eventSource = new EventSource('/api/downloads/events');
    const fetchJobs = async () => {
      const request = ++generation;
      controller?.abort();
      controller = new AbortController();
      buffer = [];
      try {
        const snapshot = await apiRequest('/api/downloads', JobsSnapshotSchema, { signal: controller.signal });
        if (disposed || request !== generation) return;
        const events = buffer || [];
        buffer = undefined;
        setJobs(reconcileSnapshot(snapshot, events));
      } catch (error) {
        if (!disposed && request === generation && !(error instanceof Error && error.name === 'AbortError')) {
          buffer = undefined;
          setOperationError(errorMessage(error));
        }
      }
    };
    eventSource.onopen = () => { setConnected(true); void fetchJobs(); };
    eventSource.onerror = () => {
      setConnected(false); generation++; controller?.abort(); buffer = undefined;
    };
    eventSource.onmessage = event => {
      let value: unknown;
      try { value = JSON.parse(event.data); } catch { setOperationError('Evento inválido recebido do servidor.'); return; }
      const parsed = SSEEventSchema.safeParse(value);
      if (!parsed.success) { setOperationError('Evento incompatível recebido do servidor.'); return; }
      const message = parsed.data;
      if (buffer) {
        buffer.push(message);
        if (buffer.length > 2000) { void fetchJobs(); return; }
      }
      setJobs(previous => applyJobEvent(previous, message));
    };
    return () => { disposed = true; generation++; controller?.abort(); eventSource.close(); };
  }, []);
  const act = useCallback(async (id: string, method: 'POST' | 'DELETE') => {
    setOperationError(null);
    try {
      await apiRequest(`/api/downloads/${encodeURIComponent(id)}${method === 'POST' ? '/cancel' : ''}`, z.object({ success: z.literal(true) }), { method });
      return true;
    } catch (error) { setOperationError(errorMessage(error)); return false; }
  }, []);
  const cancelJob = useCallback((id: string) => act(id, 'POST'), [act]);
  const deleteJob = useCallback((id: string) => act(id, 'DELETE'), [act]);
  return { jobs, connected, cancelJob, deleteJob, operationError };
}
