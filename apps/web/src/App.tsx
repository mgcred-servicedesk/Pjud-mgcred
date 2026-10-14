import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Me, Permission, PortalState, UserSummary } from '@mgcred/shared';
import { api, setCsrf, setUnauthorizedHandler } from './api.ts';
import { initials } from './format.ts';
import { Login } from './Login.tsx';
import { withViewTransition } from './motion.ts';
import { Modal, PortalContext, Toast, type PortalApi, type ToastTone } from './portal.tsx';
import { pages } from './pages/index.tsx';

const nav: Array<[string, Array<[string, string, Permission[]?]>]> = [
  ['VISÃO GERAL', [['dashboard', '▦ Dashboard']]],
  ['JURÍDICO', [['demandas', '▤ Demandas'], ['processos', '⚖ Processos'], ['tarefas', '◷ Tarefas / Prazos'], ['documentos', '▧ Documentos'], ['relatorios', '▥ Relatórios']]],
  ['GOVERNANÇA', [['governanca', '◇ Compliance & LGPD']]],
  ['SISTEMA', [['administracao', '⚙ Administração', ['users.manage', 'audit.view']], ['conta', '◉ Minha conta']]],
];

const readActivation = () => {
  if (!location.hash.startsWith('#ativar=')) return '';
  const token = location.hash.slice(8);
  history.replaceState(null, '', location.pathname);
  return token;
};

// Destaque que desliza até o item ativo do menu.
function NavIndicator({ page, navRef }: { page: string; navRef: React.RefObject<HTMLElement | null> }) {
  const [box, setBox] = useState<{ top: number; height: number } | null>(null);
  const [ready, setReady] = useState(false);
  useLayoutEffect(() => {
    const navEl = navRef.current;
    if (!navEl) return;
    const measure = () => {
      const active = navEl.querySelector<HTMLElement>('a.active');
      setBox(active ? { top: active.offsetTop, height: active.offsetHeight } : null);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(navEl);
    return () => observer.disconnect();
  }, [page, navRef]);
  useEffect(() => {
    if (!box || ready) return;
    const frame = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(frame);
  }, [box, ready]);
  if (!box) return null;
  return <span className={`nav-indicator${ready ? ' ready' : ''}`} aria-hidden="true" style={{ transform: `translateY(${box.top}px)`, height: box.height }} />;
}

export function App() {
  const [booting, setBooting] = useState(true);
  const [state, setState] = useState<PortalState | null>(null);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [activationToken, setActivationToken] = useState(readActivation);
  const [notice, setNotice] = useState('');
  const [page, setPage] = useState(() => location.hash.slice(1) || 'dashboard');
  const [query, setQuery] = useState('');
  const [searchText, setSearchText] = useState('');
  const [filter, setFilter] = useState('');
  const [modal, setModal] = useState<{ id: number; title: string; content: ReactNode } | null>(null);
  const [modalClosing, setModalClosing] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone: ToastTone; visible: boolean; id: number }>({ message: '', tone: 'success', visible: false, id: 0 });
  const [flashId, setFlashId] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [dialogEl, setDialogEl] = useState<HTMLDialogElement | null>(null);
  const toastTimer = useRef(0);
  const flashTimer = useRef(0);
  const mainRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const notify = useCallback((message: string, tone: ToastTone = 'success') => {
    setToast({ message, tone, visible: true, id: Date.now() });
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(t => ({ ...t, visible: false })), tone === 'error' ? 7000 : 4500);
  }, []);

  const flash = useCallback((id: string) => {
    setFlashId(id);
    clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlashId(''), 2400);
  }, []);

  const signOut = useCallback((message = '') => {
    withViewTransition(() => {
      setState(null);
      setUsers([]);
      setModal(null);
      setModalClosing(false);
      setCsrf('');
      setNotice(message);
    }, 'auth');
  }, []);

  const loadState = useCallback(async () => {
    const fresh = await api<PortalState>('/state');
    const list = fresh.user.permissions.includes('users.manage') ? (await api<{ users: UserSummary[] }>('/users')).users : [];
    return { fresh, list };
  }, []);

  const refresh = useCallback(async () => {
    const { fresh, list } = await loadState();
    setUsers(list);
    setState(fresh);
  }, [loadState]);

  useEffect(() => {
    setUnauthorizedHandler(() => signOut('Sua sessão expirou. Entre novamente.'));
    if (activationToken) { setBooting(false); return; }
    api<{ user: Me; csrf: string }>('/me')
      .then(r => { setCsrf(r.csrf); return refresh(); })
      .catch(() => {})
      .finally(() => setBooting(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onHash = () => {
      const token = readActivation();
      if (token) { signOut(); setActivationToken(token); return; }
      withViewTransition(() => {
        setPage(location.hash.slice(1) || 'dashboard');
        setMenuOpen(false);
      });
      window.scrollTo({ top: 0 });
      mainRef.current?.focus({ preventScroll: true });
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [signOut]);

  // Atalhos: "/" foca a busca; Esc fecha o menu mobile.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && e.target.closest('input, textarea, select, [contenteditable]');
      if (e.key === '/' && !typing && !document.querySelector('dialog[open]')) { e.preventDefault(); searchRef.current?.focus(); }
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const closeModal = useCallback(() => setModalClosing(true), []);
  const onModalClosed = useCallback(() => { setModal(null); setModalClosing(false); }, []);

  const portal = useMemo<PortalApi | null>(() => state && {
    state, users, query, filter, refresh, notify, flash, flashId, closeModal,
    can: p => state.user.permissions.includes(p),
    openModal: (title, content) => {
      setModalClosing(false);
      setModal({ id: Date.now(), title, content });
      setToast(t => (t.visible ? { ...t, id: Date.now() } : t));
    },
    navigate: (target, opts = {}) => {
      const apply = () => {
        setFilter(opts.filter ?? '');
        setQuery(opts.query ?? '');
        if (opts.query !== undefined) setSearchText(opts.query);
      };
      if (location.hash === '#' + target || (target === 'dashboard' && !location.hash)) withViewTransition(() => { apply(); setPage(target); });
      else { apply(); location.hash = target; }
    },
  }, [state, users, query, filter, refresh, notify, flash, flashId, closeModal]);

  if (booting) return <div className="boot-splash"><img src="/assets/mgcred-logo.webp" alt="MG Cred" /></div>;
  if (!portal || !state) {
    return (
      <Login activationToken={activationToken} notice={notice}
        onLogin={async (_user, csrf) => {
          setCsrf(csrf);
          const { fresh, list } = await loadState();
          withViewTransition(() => { setNotice(''); setUsers(list); setState(fresh); }, 'auth');
        }}
        onActivated={() => { setActivationToken(''); setNotice('Senha definida. Entre com seu e-mail e senha.'); }} />
    );
  }

  const me = state.user;
  const Page = pages[page] ?? pages.dashboard!;
  return (
    <PortalContext.Provider value={portal}>
      <div id="portal">
        <aside className={`sidebar${menuOpen ? ' open' : ''}`} id="sidebar">
          <a href="#dashboard" className="brand" aria-label="MG Cred — início">
            <img src="/assets/mgcred-logo-white.webp" width="168" height="60" alt="MG Cred" /><small>JURÍDICO & COMPLIANCE</small>
          </a>
          <nav aria-label="Menu principal" ref={navRef}>
            <NavIndicator page={page} navRef={navRef} />
            {nav.map(([section, links]) => (
              <div key={section}>
                <p>{section}</p>
                {links.filter(([, , perms]) => !perms || perms.some(p => portal.can(p))).map(([hash, text]) => (
                  <a key={hash} href={'#' + hash} className={page === hash ? 'active' : undefined} aria-current={page === hash ? 'page' : undefined}>{text}</a>
                ))}
              </div>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <span className="avatar">{initials(me.name)}</span>
            <div><span>{me.name}</span><small>{me.role.name}</small></div>
          </div>
        </aside>
        <div className={`sidebar-backdrop${menuOpen ? ' show' : ''}`} onClick={() => setMenuOpen(false)} aria-hidden="true" />
        <div className="workspace">
          <header className="topbar">
            <button className={`mobile-menu subtle${menuOpen ? ' is-open' : ''}`} aria-label={menuOpen ? 'Fechar menu' : 'Abrir menu'} aria-expanded={menuOpen} onClick={() => setMenuOpen(o => !o)}><span className="menu-icon" aria-hidden="true" /></button>
            <form id="global-search" role="search" onSubmit={e => { e.preventDefault(); portal.navigate('busca', { query: searchText.trim() }); }}>
              <input ref={searchRef} type="search" name="query" aria-label="Buscar nos registros autorizados" placeholder="Buscar nos seus registros…" maxLength={160}
                value={searchText} onChange={e => setSearchText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') { setSearchText(''); e.currentTarget.blur(); } }} />
              <kbd className="search-hint" aria-hidden="true">/</kbd>
              <button className="subtle" aria-label="Pesquisar">⌕</button>
            </form>
            <button className={`secondary refresh-button${refreshing ? ' is-spinning' : ''}`} id="refresh" disabled={refreshing}
              onClick={() => {
                setRefreshing(true);
                refresh().then(() => notify('Dados atualizados.'), e => notify(e.message, 'error')).finally(() => setRefreshing(false));
              }}>
              <span className="refresh-icon" aria-hidden="true">↻</span> Atualizar
            </button>
            <button className="subtle" onClick={() => api('/logout', 'POST', {}).then(() => signOut(), e => notify(e.message, 'error'))}>Sair</button>
          </header>
          <main id="main" tabIndex={-1} ref={mainRef}>
            {state.truncated && <div className="error-banner">Há mais de 1.000 registros. Os indicadores estão limitados aos registros carregados. Contate a TI para ampliar a paginação antes de usar os totais.</div>}
            <div className="page" key={`${page}|${filter}|${query}`}><Page /></div>
          </main>
          <footer>Jurídico MG Cred · Ambiente autenticado · Informações conforme suas permissões.</footer>
        </div>
      </div>
      {modal && <Modal title={modal.title} content={modal.content} contentKey={modal.id} closing={modalClosing} onRequestClose={closeModal} onClosed={onModalClosed} onDialog={setDialogEl} />}
      <Toast {...toast} container={dialogEl} />
    </PortalContext.Provider>
  );
}
