import { useDeferredValue, useState, type CSSProperties } from 'react';
import { closedRequestStatuses, label, requestStatuses, type RequestItem } from '@mgcred/shared';
import { withViewTransition } from '../motion.ts';
import { Badge, Blank, Highlight, PageHead, usePortal } from '../portal.tsx';
import { RequestDetail, RequestForm } from '../dialogs/requests.tsx';
import { useCaseActions } from '../dialogs/cases.tsx';

export const isOpen = (r: RequestItem) => !closedRequestStatuses.includes(r.status);

// Atraso escalonado das primeiras linhas (entrada em cascata).
export const stagger = (i: number) => ({ '--i': Math.min(i, 12) }) as CSSProperties;

export function useRequestActions() {
  const { openModal } = usePortal();
  return {
    showRequest: (r: { id: string; code: string; subject?: string }) => openModal(r.subject ? `${r.code} · ${r.subject}` : r.code, <RequestDetail id={r.id} />),
    newRequest: () => openModal('Nova solicitação jurídica', <RequestForm />),
  };
}

export function NewRequestButton() {
  const { can } = usePortal();
  const { newRequest } = useRequestActions();
  return can('requests.create') ? <button className="primary" onClick={newRequest}>＋ Nova solicitação jurídica</button> : null;
}

export function DemandTable({ rows, term = '' }: { rows: RequestItem[]; term?: string }) {
  const { flashId } = usePortal();
  const { showRequest } = useRequestActions();
  if (!rows.length) return <Blank>Nenhuma solicitação encontrada.</Blank>;
  return (
    <div className="table-wrap">
      <table className="demand-table">
        <colgroup><col className="col-subject" /><col className="col-category" /><col className="col-status" /><col className="col-priority" /></colgroup>
        <thead><tr><th>Solicitação</th><th>Categoria</th><th>Status</th><th>Prioridade</th></tr></thead>
        <tbody>
          {rows.map((d, i) => (
            <tr key={d.id} className={`row-in${d.id === flashId ? ' row-flash' : ''}`} style={stagger(i)}>
              <td>
                <button className="row-link" onClick={() => showRequest(d)}><Highlight text={d.subject} term={term} /></button>
                <small><Highlight text={d.code} term={term} /> · <Highlight text={d.requester.name} term={term} /></small>
              </td>
              <td>{d.category.name}</td>
              <td><Badge code={d.status} /></td>
              <td><Badge code={d.priority} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DemandsPage() {
  const { state, query: initialQuery, filter: initialFilter } = usePortal();
  const [query, setQuery] = useState(initialQuery);
  const [filter, setFilter] = useState(initialFilter);
  const term = useDeferredValue(query);
  const q = term.trim().toLowerCase();
  const matches = state.requests.filter(d => `${d.code} ${d.subject} ${d.requester.name} ${d.department?.name ?? ''}`.toLowerCase().includes(q));
  const rows = matches.filter(d => !filter || d.status === filter);
  const counts = new Map(requestStatuses.map(s => [s, matches.filter(d => d.status === s).length]));
  const chips: Array<[string, string, number]> = [['', 'Todos', matches.length], ...requestStatuses.map(s => [s, label(s), counts.get(s) ?? 0] as [string, string, number])];
  return (
    <>
      <PageHead title="Demandas jurídicas" sub="Solicitações que você está autorizado a acompanhar."><NewRequestButton /></PageHead>
      <section className="panel">
        <div className="toolbar toolbar-stack">
          <div className="search-field">
            <span className="search-field-icon" aria-hidden="true">⌕</span>
            <input aria-label="Buscar demandas" placeholder="Assunto, código ou solicitante" value={query} onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Escape') setQuery(''); }} />
            <button type="button" className={`search-clear${query ? ' show' : ''}`} aria-label="Limpar busca" tabIndex={query ? 0 : -1} onClick={() => setQuery('')}>×</button>
          </div>
          <div className="chips" role="radiogroup" aria-label="Filtrar por status">
            {chips.map(([value, text, n]) => (
              <button key={value || 'todos'} type="button" role="radio" aria-checked={filter === value}
                className={`chip${filter === value ? ' active' : ''}${n === 0 && value ? ' empty' : ''}`}
                onClick={() => withViewTransition(() => setFilter(value), 'filter')}>
                {text}<span className="chip-count">{n}</span>
              </button>
            ))}
          </div>
        </div>
        <p className="results-count" aria-live="polite">
          {rows.length === state.requests.length ? `${rows.length} solicitações` : `${rows.length} de ${state.requests.length} solicitações`}
        </p>
        <div className="results"><DemandTable rows={rows} term={term} /></div>
      </section>
    </>
  );
}

export function GovernancePage() {
  const { state } = usePortal();
  return (
    <>
      <PageHead title="Compliance & LGPD" sub="Solicitações de governança registradas no Jurídico."><NewRequestButton /></PageHead>
      <div className="notice">Use as categorias de governança (Compliance e LGPD) para acompanhar solicitações. Gestão especializada de incidentes, denúncias e registro de tratamento exige um incremento posterior.</div>
      <section className="panel"><DemandTable rows={state.requests.filter(d => d.category.isGovernance)} /></section>
    </>
  );
}

export function SearchPage() {
  const { state, query } = usePortal();
  const { showCase } = useCaseActions();
  const q = query.trim().toLowerCase();
  const requests = q ? state.requests.filter(d => `${d.subject} ${d.code} ${d.description}`.toLowerCase().includes(q)) : [];
  const cases = q ? state.cases.filter(c => `${c.number} ${c.title} ${c.party ?? ''}`.toLowerCase().includes(q)) : [];
  const total = requests.length + cases.length;
  return (
    <>
      <PageHead title="Busca" sub={q ? `${total} resultado${total === 1 ? '' : 's'} para “${query}”` : 'Digite um termo na busca acima (atalho: /).'} />
      {q && !total && <div className="notice fade-in">Nada encontrado. Tente o código da demanda (ex.: JUR-2026-001), o número do processo ou parte do assunto.</div>}
      {requests.length > 0 && <section className="panel"><div className="panel-head"><h2>Demandas <span className="chip-count">{requests.length}</span></h2></div><DemandTable rows={requests} term={query} /></section>}
      {cases.length > 0 && (
        <section className="panel">
          <div className="panel-head"><h2>Processos <span className="chip-count">{cases.length}</span></h2></div>
          <div className="panel-body">
            {cases.map((c, i) => (
              <p key={c.id} className="row-in" style={stagger(i)}>
                <button className="row-link" onClick={() => showCase(c)}><Highlight text={`${c.number} · ${c.title}`} term={query} /></button>
              </p>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
