import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './Button.js';

/** Wrap before paginating, so a long native log line cannot hide other lines or actions. */
export function PagedText({ lines, label, dark = true, prose = false }: { lines: string[]; label: string; dark?: boolean; prose?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [capacity, setCapacity] = useState({ width: 500, rows: 8, font: '13px monospace' });
  const [page, setPage] = useState<number | null>(dark ? null : 0);
  useEffect(() => {
    const element = ref.current!;
    const measure = () => {
      const style = getComputedStyle(element);
      const horizontalPadding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const verticalPadding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      const next = { width: Math.max(1, element.clientWidth - horizontalPadding - 2), rows: Math.max(1, Math.floor((element.clientHeight - verticalPadding) / parseFloat(style.lineHeight))), font: `${style.fontWeight} ${style.fontSize} ${style.fontFamily}` };
      setCapacity(previous => previous.width === next.width && previous.rows === next.rows && previous.font === next.font ? previous : next);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    void document.fonts.ready.then(measure);
    return () => observer.disconnect();
  }, []);
  const wrapped = useMemo(() => {
    const context = document.createElement('canvas').getContext('2d')!;
    context.font = capacity.font;
    return lines.flatMap(line => line.split('\n').flatMap(part => {
      const chars = Array.from(part.replace(/\t/g, '    '));
      const result: string[] = [];
      for (let start = 0; start < chars.length;) {
        let low = 1, high = chars.length - start;
        while (low < high) {
          const middle = Math.ceil((low + high) / 2);
          if (context.measureText(chars.slice(start, start + middle).join('')).width <= capacity.width) low = middle;
          else high = middle - 1;
        }
        let count = low;
        if (prose && start + count < chars.length) {
          const boundary = chars.slice(start, start + count).lastIndexOf(' ');
          if (boundary > 0) count = boundary + 1;
        }
        result.push(chars.slice(start, start + count).join(''));
        start += count;
      }
      return result.length ? result : [''];
    }));
  }, [lines, capacity.width, capacity.font, prose]);
  const last = Math.max(0, Math.ceil(wrapped.length / capacity.rows) - 1);
  const selected = page === null ? last : Math.min(page, last);
  return <div className="ui-paged-text">
    <div ref={ref} className={`ui-terminal${dark ? '' : ' ui-terminal-light'}${prose ? ' ui-terminal-prose' : ''}`} role="region" aria-label={label} tabIndex={0}>
      {wrapped.slice(selected * capacity.rows, (selected + 1) * capacity.rows).join('\n') || 'Nenhum log registrado nesta tentativa.'}
    </div>
    <div className="ui-pagination">
      <Button iconOnly aria-label={`Página anterior ${dark ? 'dos logs' : 'do conteúdo'}`} disabled={selected === 0} onClick={() => setPage(selected - 1)}><ChevronLeft /></Button>
      <span className="ui-meta" role="status">Página {selected + 1} de {last + 1}</span>
      <Button iconOnly aria-label={`Próxima página ${dark ? 'dos logs' : 'do conteúdo'}`} disabled={selected === last} onClick={() => setPage(selected + 1 === last ? null : selected + 1)}><ChevronRight /></Button>
      {page !== null && selected < last && <Button onClick={() => setPage(null)}><ArrowDown />Ir para o final</Button>}
    </div>
  </div>;
}
