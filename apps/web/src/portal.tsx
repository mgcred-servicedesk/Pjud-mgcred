import { createContext, useContext, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { label, type Permission, type PortalState, type UserSummary } from '@mgcred/shared';
import { prefersReducedMotion, useAnimatedNumber } from './motion.ts';

export type ToastTone = 'success' | 'error';

export interface PortalApi {
  state: PortalState;
  users: UserSummary[];
  can: (p: Permission) => boolean;
  refresh: () => Promise<void>;
  openModal: (title: string, content: ReactNode) => void;
  closeModal: () => void;
  notify: (message: string, tone?: ToastTone) => void;
  navigate: (page: string, opts?: { filter?: string; query?: string }) => void;
  flash: (id: string) => void;
  flashId: string;
  query: string;
  filter: string;
}

export const PortalContext = createContext<PortalApi | null>(null);

export function usePortal() {
  const ctx = useContext(PortalContext);
  if (!ctx) throw new Error('PortalContext ausente.');
  return ctx;
}

const tone = (code: string) =>
  ['concluida', 'encerrado', 'baixo'].includes(code) ? 'green'
    : ['urgente', 'alto'].includes(code) ? 'red'
      : ['alta', 'medio', 'aguardando_mgcred'].includes(code) ? 'amber'
        : ['nao_avaliado', 'arquivada'].includes(code) ? 'neutral' : 'blue';

export function Badge({ code }: { code: string }) {
  return <span className={`badge ${tone(code)}`}>{label(code)}</span>;
}

export function Options({ list, labelled = true }: { list: readonly string[]; labelled?: boolean }) {
  return <>{list.map(v => <option key={v} value={v}>{labelled ? label(v) : v}</option>)}</>;
}

export function PageHead({ title, sub, children }: { title: string; sub: string; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div><h1>{title}</h1><p className="muted">{sub}</p></div>
      <div className="page-actions">{children}</div>
    </div>
  );
}

export function Blank({ children }: { children: ReactNode }) {
  return <p className="blank fade-in">{children}</p>;
}

export function AnimatedNumber({ value }: { value: number }) {
  return <>{useAnimatedNumber(value)}</>;
}

// Realça o termo buscado dentro do texto.
export function Highlight({ text, term }: { text: string; term: string }) {
  const q = term.trim();
  if (!q) return <>{text}</>;
  const lower = text.toLowerCase(), needle = q.toLowerCase();
  const parts: ReactNode[] = [];
  let from = 0, at = lower.indexOf(needle);
  while (at !== -1) {
    if (at > from) parts.push(text.slice(from, at));
    parts.push(<mark key={at}>{text.slice(at, at + q.length)}</mark>);
    from = at + q.length;
    at = lower.indexOf(needle, from);
  }
  parts.push(text.slice(from));
  return <>{parts}</>;
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="skeleton-group" aria-busy="true" aria-label="Carregando">
      {Array.from({ length: lines }, (_, i) => <span key={i} className="skeleton" />)}
    </div>
  );
}

// Formulário com envio assíncrono: estado de carregamento no botão e erro animado.
export function AsyncForm({ onSubmit, children, className, id }: {
  onSubmit: (values: Record<string, string>, form: HTMLFormElement) => Promise<void>;
  children: ReactNode; className?: string; id?: string;
}) {
  const [error, setError] = useState({ message: '', at: 0 });
  const [busy, setBusy] = useState(false);
  async function handle(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setError({ message: '', at: 0 });
    setBusy(true);
    try {
      await onSubmit(Object.fromEntries(new FormData(form)) as Record<string, string>, form);
    } catch (err) {
      setError({ message: (err as Error).message, at: Date.now() });
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={handle} className={className} id={id} aria-busy={busy}>
      <fieldset disabled={busy} className="plain-fieldset">{children}</fieldset>
      {error.message && <p key={error.at} className="form-error shake" role="alert">{error.message}</p>}
    </form>
  );
}

export function Modal({ title, content, contentKey, closing, onRequestClose, onClosed, onDialog }: {
  title: string; content: ReactNode; contentKey: number; closing: boolean;
  onRequestClose: () => void; onClosed: () => void; onDialog: (el: HTMLDialogElement | null) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    onDialog(dialog);
    return () => onDialog(null);
  }, [onDialog]);
  useEffect(() => {
    const dialog = ref.current;
    if (!closing || !dialog) return;
    const finish = () => { if (dialog.open) dialog.close(); onClosed(); };
    if (prefersReducedMotion()) { finish(); return; }
    const timer = window.setTimeout(finish, 260);
    return () => clearTimeout(timer);
  }, [closing, onClosed]);
  return (
    <dialog ref={ref} className={`wide-dialog${closing ? ' is-closing' : ''}`} aria-labelledby="modal-title"
      onCancel={e => { e.preventDefault(); onRequestClose(); }}>
      <div className="dialog-head">
        <h2 id="modal-title" key={'t' + contentKey} className="swap-in">{title}</h2>
        <button className="close subtle" type="button" aria-label="Fechar" onClick={onRequestClose}>×</button>
      </div>
      <div id="modal-body" key={contentKey} className="swap-in">{content}</div>
    </dialog>
  );
}

// O toast usa a Popover API para ficar na camada superior. Com um diálogo modal aberto,
// é renderizado dentro dele: fora do diálogo o conteúdo fica inerte e não seria anunciado.
export function Toast({ container, ...props }: { message: string; tone: ToastTone; visible: boolean; id: number; container: HTMLElement | null }) {
  return createPortal(<ToastBody {...props} />, container ?? document.body);
}

function ToastBody({ message, tone, visible, id }: { message: string; tone: ToastTone; visible: boolean; id: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el?.showPopover) return;
    if (visible) {
      if (el.matches(':popover-open')) el.hidePopover();
      el.showPopover();
      return;
    }
    const timer = window.setTimeout(() => { if (el.matches(':popover-open')) el.hidePopover(); }, 400);
    return () => clearTimeout(timer);
  }, [visible, id]);
  return (
    <div ref={ref} popover="manual" className={`toast toast-${tone}${visible ? ' show' : ''}`} role={tone === 'error' ? 'alert' : 'status'} aria-live="polite">
      {message}
    </div>
  );
}
