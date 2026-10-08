import React, { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { PagedText } from './PagedText.js';
import { Button } from './Button.js';
export { Button } from './Button.js';

export function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return <div className="ui-field">
    <label htmlFor={id}>{label}</label>
    {children}
    {hint && <p className="ui-help" id={`${id}-hint`}>{hint}</p>}
  </div>;
}

export function StatusBadge({ tone = 'neutral', children }: { tone?: 'neutral' | 'active' | 'success' | 'warning' | 'danger'; children: ReactNode }) {
  return <span className={`ui-status ui-status-${tone}`}>{children}</span>;
}

export function Notice({ tone = 'danger', children }: { tone?: 'danger' | 'warning' | 'success'; children: ReactNode }) {
  return <div className={`ui-notice ui-notice-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>{children}</div>;
}

export function Tabs<T extends string>({ label, value, onChange, items, prefix }: {
  label: string; value: T; onChange: (value: T) => void; items: { value: T; label: string }[]; prefix: string;
}) {
  return <div className="ui-tabs" role="tablist" aria-label={label}>
    {items.map((item, index) => <button key={item.value} id={`${prefix}-${item.value}-tab`} type="button" role="tab"
      aria-selected={value === item.value} aria-controls={`${prefix}-${item.value}-panel`} tabIndex={value === item.value ? 0 : -1}
      onClick={() => onChange(item.value)} onKeyDown={event => {
        const next = event.key === 'ArrowRight' ? (index + 1) % items.length : event.key === 'ArrowLeft' ? (index + items.length - 1) % items.length : event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : -1;
        if (next < 0) return;
        event.preventDefault(); onChange(items[next].value);
        document.getElementById(`${prefix}-${items[next].value}-tab`)?.focus();
      }}>{item.label}</button>)}
  </div>;
}

// Native dialog supplies the top layer and inert background. Wrap Tab explicitly
// to keep focus inside the dialog instead of moving to the browser toolbar.
// Keeping it mounted only while open also prevents hidden controls from receiving focus.
export function Modal({ title, description, onClose, children, footer, wide = false, fill = false, returnFocus }: {
  title: string; description?: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean; fill?: boolean; returnFocus?: HTMLElement | null;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const dialog = ref.current!;
    const previousFocus = returnFocus ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = 'hidden';
    dialog.querySelector<HTMLButtonElement>('[data-modal-close]')?.focus();
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);
  return createPortal(<dialog ref={ref} className={`ui-modal${wide ? ' ui-modal-wide' : ''}${fill ? ' ui-modal-fill' : ''}`}
    aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined}
    onKeyDown={event => {
      if (event.key !== 'Tab') return;
      event.stopPropagation();
      const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], summary, [tabindex]:not([tabindex="-1"])')]
        .filter(element => element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }}
    onCancel={event => { event.preventDefault(); event.stopPropagation(); closeRef.current(); }}
    onClick={event => {
      if (event.target !== event.currentTarget) return;
      const box = event.currentTarget.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) closeRef.current();
    }}>
    <div className="ui-modal-layout">
      <header className="ui-modal-header">
        <div><h2 id={titleId}>{title}</h2>{description && <p className="ui-help" id={descriptionId}>{description}</p>}</div>
        <Button iconOnly onClick={onClose} aria-label={`Fechar ${title.toLowerCase()}`} data-modal-close><X /></Button>
      </header>
      <div className="ui-modal-body">{children}</div>
      {footer && <footer className="ui-modal-footer">{footer}</footer>}
    </div>
  </dialog>, document.body);
}

export function MediaTitle({ title, heading = false }: { title: string; heading?: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const [expanded, setExpanded] = React.useState(false);
  const [clipped, setClipped] = React.useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      setClipped(element.scrollHeight > element.clientHeight + 1);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [title, expanded]);
  return <div className="ui-media-title">
    {heading ? <h3 ref={ref as React.RefObject<HTMLHeadingElement>} className="ui-clamp">{title}</h3>
      : <p ref={ref as React.RefObject<HTMLParagraphElement>} className="ui-clamp">{title}</p>}
    {clipped && <button type="button" className="ui-text-button" onClick={() => setExpanded(true)}>Ver título completo</button>}
    {expanded && <Modal fill title="Título da mídia" onClose={() => setExpanded(false)} footer={<Button onClick={() => setExpanded(false)}>Fechar</Button>}><PagedText dark={false} prose lines={[title]} label="Título completo" /></Modal>}
  </div>;
}
