import React, { useEffect, useRef } from 'react';
import { Terminal, Copy, Check } from 'lucide-react';

interface LogViewerProps {
  logs: string[];
  title?: string;
  isOpen: boolean;
  onClose: () => void;
}

export const LogViewer: React.FC<LogViewerProps> = ({ logs, title, isOpen, onClose }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = React.useState(false);

  useEffect(() => {
    if (isOpen && containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [logs, isOpen]);

  const handleCopy = () => {
    navigator.clipboard.writeText(logs.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 text-slate-100 rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[80vh]">
        {/* Topbar do Terminal */}
        <div className="px-4 py-3 bg-slate-950/80 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-mono font-medium text-slate-300 truncate max-w-md">
              {title || 'Terminal yt-dlp'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-white px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 transition"
              title="Copiar todos os logs"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copiado' : 'Copiar'}</span>
            </button>
            <button
              onClick={onClose}
              className="text-xs text-slate-400 hover:text-white px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 transition"
            >
              Fechar
            </button>
          </div>
        </div>

        {/* Console Output */}
        <div
          ref={containerRef}
          className="p-4 overflow-y-auto font-mono text-xs space-y-1 bg-slate-900/90 text-slate-300 flex-1 min-h-[300px]"
        >
          {logs.length === 0 ? (
            <p className="text-slate-500 italic">Nenhum log registrado ainda...</p>
          ) : (
            logs.map((log, idx) => (
              <div key={idx} className="leading-relaxed hover:bg-slate-800/40 px-1 rounded break-all">
                {log}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
