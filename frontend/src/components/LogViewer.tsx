import React, { useEffect, useRef } from 'react';
import { Terminal, Copy, Check, X } from 'lucide-react';

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
    <div
      className="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-md flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="glass-dark rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl flex flex-col max-h-[80vh]">
        {/* Topbar do Terminal — Vidro Escuro */}
        <div className="px-4 py-3 bg-slate-950/50 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-blue-400" strokeWidth={1.5} />
            <span className="text-xs font-mono font-medium text-slate-300 truncate max-w-md">
              {title || 'Terminal yt-dlp'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-white px-2.5 py-1 rounded-lg glass-pill !bg-white/5 !border-white/10 hover:!bg-white/10 transition cursor-pointer"
              title="Copiar todos os logs"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" strokeWidth={1.5} /> : <Copy className="w-3.5 h-3.5" strokeWidth={1.5} />}
              <span>{copied ? 'Copiado' : 'Copiar'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg glass-pill !bg-white/5 !border-white/10 hover:!bg-white/10 transition cursor-pointer"
              title="Fechar"
            >
              <X className="w-4 h-4" strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {/* Console Output — JetBrains Mono */}
        <div
          ref={containerRef}
          className="p-4 overflow-y-auto font-mono text-xs space-y-1 text-slate-300 flex-1 min-h-[300px]"
        >
          {logs.length === 0 ? (
            <p className="text-slate-500 italic">Nenhum log registrado ainda...</p>
          ) : (
            logs.map((log, idx) => (
              <div key={idx} className="leading-relaxed hover:bg-white/5 px-1.5 py-0.5 rounded break-all transition-colors">
                {log}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
