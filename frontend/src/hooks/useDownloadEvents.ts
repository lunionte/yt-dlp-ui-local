import { useState, useEffect, useCallback } from 'react';
import { DownloadJob, DownloadProgress, DownloadStatus } from '../types/download.js';

interface SSEMessage {
  type: 'PROGRESS' | 'STATUS' | 'LOG' | 'JOB_ADDED' | 'JOB_REMOVED';
  jobId: string;
  payload: any;
}

export function useDownloadEvents() {
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [connected, setConnected] = useState(false);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await fetch('/api/downloads');
      if (res.ok) {
        const data = await res.json();
        setJobs(data);
      }
    } catch (err) {
      console.error('Erro ao buscar lista de downloads:', err);
    }
  }, []);

  useEffect(() => {
    fetchJobs();

    const eventSource = new EventSource('/api/downloads/events');

    eventSource.onopen = () => {
      setConnected(true);
    };

    eventSource.onerror = () => {
      setConnected(false);
    };

    eventSource.onmessage = (event) => {
      try {
        const msg: SSEMessage = JSON.parse(event.data);

        setJobs((prevJobs) => {
          if (msg.type === 'JOB_ADDED') {
            const exists = prevJobs.some((j) => j.id === msg.payload.id);
            if (exists) return prevJobs;
            return [msg.payload, ...prevJobs];
          }

          if (msg.type === 'JOB_REMOVED') {
            return prevJobs.filter((j) => j.id !== msg.payload.id);
          }

          return prevJobs.map((job) => {
            if (job.id !== msg.jobId) return job;

            if (msg.type === 'PROGRESS') {
              return {
                ...job,
                progress: msg.payload.progress as DownloadProgress,
                status: (msg.payload.status || job.status) as DownloadStatus,
              };
            }

            if (msg.type === 'STATUS') {
              return {
                ...job,
                ...msg.payload,
                progress: msg.payload.progress ? msg.payload.progress : job.progress,
              };
            }

            if (msg.type === 'LOG') {
              const newLogs = [...job.logs, msg.payload.line];
              if (newLogs.length > 200) newLogs.shift();
              return {
                ...job,
                logs: newLogs,
              };
            }

            return job;
          });
        });
      } catch (err) {
        // Ignora heartbeats ou pings
      }
    };

    return () => {
      eventSource.close();
    };
  }, [fetchJobs]);

  const cancelJob = async (id: string) => {
    try {
      const res = await fetch(`/api/downloads/${id}/cancel`, { method: 'POST' });
      return res.ok;
    } catch (err) {
      console.error('Erro ao cancelar download:', err);
      return false;
    }
  };

  const deleteJob = async (id: string) => {
    try {
      const res = await fetch(`/api/downloads/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setJobs((prev) => prev.filter((j) => j.id !== id));
      }
      return res.ok;
    } catch (err) {
      console.error('Erro ao excluir download:', err);
      return false;
    }
  };

  return {
    jobs,
    connected,
    cancelJob,
    deleteJob,
    refreshJobs: fetchJobs,
  };
}
