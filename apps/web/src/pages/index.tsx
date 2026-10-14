import { useEffect, useState, type ComponentType } from 'react';
import { caseRisks, type TaskItem } from '@mgcred/shared';
import { api } from '../api.ts';
import { actionLabel, dateStr, datetime, daysLeft, kb, money } from '../format.ts';
import { AnimatedNumber, AsyncForm, Badge, Blank, PageHead, usePortal } from '../portal.tsx';
import { useCaseActions } from '../dialogs/cases.tsx';
import { AuditDialog, DepartmentForm, InviteLink, TaskForm, UserActiveConfirm, UserForm } from '../dialogs/admin.tsx';
import { DemandsPage, GovernancePage, isOpen, NewRequestButton, SearchPage, stagger, useRequestActions } from './requests.tsx';

// Marcação otimista: a tarefa muda na hora e volta se o servidor recusar.
function TaskRow({ t, index }: { t: TaskItem; index: number }) {
  const { refresh, notify, flashId } = usePortal();
  const [done, setDone] = useState(t.status === 'concluida');
  const [saving, setSaving] = useState(false);
  useEffect(() => { setDone(t.status === 'concluida'); }, [t.status]);
  async function toggle(next: boolean) {
    setDone(next);
    setSaving(true);
    try {
      await api('/tasks/' + t.id, 'PATCH', { done: next, version: t.version });
      await refresh();
      notify(next ? 'Tarefa concluída.' : 'Tarefa reaberta.');
    } catch (err) {
      setDone(!next);
      notify((err as Error).message, 'error');
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className={`check-row row-in${done ? ' done' : ''}${t.id === flashId ? ' row-flash' : ''}`} style={stagger(index)} aria-busy={saving}>
      <input id={'task-' + t.id} type="checkbox" checked={done} disabled={saving} onChange={e => toggle(e.target.checked)} />
      <label htmlFor={'task-' + t.id}><span className="task-title">{t.title}</span>
        <small>{t.assignee?.name ?? 'Jurídico'} · {dateStr(t.dueDate)}{t.request ? ' · ' + t.request.code : ''}{t.caseRef ? ' · ' + t.caseRef.number : ''}</small>
        {t.description && <small>{t.description}</small>}
      </label>
      <Badge code={t.priority} />
    </div>
  );
}

function Metrics() {
  const { state, navigate } = usePortal();
  const items: Array<[string, number, string, () => void, boolean?]> = [
    ['Demandas abertas', state.requests.filter(isOpen).length, 'Em acompanhamento', () => navigate('demandas')],
    ['Prazos próximos', state.tasks.filter(t => t.status === 'pendente' && daysLeft(t.dueDate) >= 0 && daysLeft(t.dueDate) <= 7).length, 'Nos próximos 7 dias', () => navigate('tarefas')],
    ['Processos ativos', state.cases.filter(c => c.status === 'ativo').length, 'Acesso autorizado', () => navigate('processos')],
    ['Aguardando MG Cred', state.requests.filter(d => d.status === 'aguardando_mgcred').length, 'Providências pendentes', () => navigate('demandas', { filter: 'aguardando_mgcred' }), true],
  ];
  return (
    <div className="metrics">
      {items.map(([title, n, caption, go, attention]) => (
        <button key={title} className={`metric${attention ? ' attention' : ''}`} onClick={go}>
          <span className="metric-top">{title}</span><strong><AnimatedNumber value={n} /></strong><small>{caption}</small>
        </button>
      ))}
    </div>
  );
}

function Dashboard() {
  const { state } = usePortal();
  const { showRequest, newRequest } = useRequestActions();
  const pending = state.requests.filter(d => d.status === 'aguardando_mgcred');
  const governance = state.categories.filter(c => c.isGovernance);
  return (
    <>
      <PageHead title="Jurídico MG Cred" sub="Demandas, processos e providências do seu ambiente."><NewRequestButton /></PageHead>
      <Metrics />
      <div className="reference-grid">
        <section className="panel">
          <div className="panel-head"><h2>Prioridades e próximos prazos</h2></div>
          {state.tasks.filter(t => t.status === 'pendente').slice(0, 5).map(t => (
            <div key={t.id} className="reference-row row-in">
              <div><strong>{t.title}</strong><p>{t.assignee?.name ?? 'Jurídico'} · {dateStr(t.dueDate)}</p></div>
              <Badge code={daysLeft(t.dueDate) < 0 ? 'urgente' : t.priority} />
            </div>
          ))}
          {!state.tasks.some(t => t.status === 'pendente') && <Blank>Nenhuma tarefa pendente.</Blank>}
          <a className="text-button" href="#tarefas">Ver tarefas →</a>
        </section>
        <section className="panel">
          <h2>Acesso rápido</h2>
          <div className="quick-actions space-top">
            <button onClick={newRequest}>＋ Abrir demanda</button>
            <a href="#documentos">▱ Documentos</a><a href="#relatorios">◫ Relatórios</a><a href="#governanca">◇ Compliance</a>
          </div>
          <h2 className="subheading">Pendências da MG Cred</h2>
          {pending.slice(0, 3).map(d => (
            <div key={d.id} className="reference-row row-in">
              <div><button className="row-link" onClick={() => showRequest(d)}>{d.subject}</button><p>{d.code}</p></div>
              <Badge code={d.priority} />
            </div>
          ))}
          {!pending.length && <p className="muted">Nenhuma providência pendente.</p>}
        </section>
        <section className="panel">
          <h2>Últimas movimentações</h2>
          {state.activity.slice(0, 5).map(a => (
            <div key={a.id} className="reference-row row-in">
              <div>
                <button className="row-link" onClick={() => a.entityId && showRequest({ id: a.entityId, code: a.entityLabel ?? '' })}>{a.entityLabel} · {actionLabel(a.action)}</button>
                <p>{a.actor ?? 'Sistema'} · {datetime(a.createdAt)}</p>
              </div>
            </div>
          ))}
          {!state.activity.length && <p className="muted">Nenhuma movimentação registrada.</p>}
        </section>
        <section className="panel">
          <h2>Compliance & LGPD</h2>
          {governance.map(c => (
            <div key={c.id} className="reference-row"><strong>{c.name}</strong><span>{state.requests.filter(d => d.category.id === c.id && isOpen(d)).length} abertas</span></div>
          ))}
          <p className="muted">Solicitações registradas nas categorias de governança. Controles especializados de incidentes e políticas estão fora deste MVP.</p>
          <a className="text-button" href="#governanca">Abrir governança →</a>
        </section>
      </div>
    </>
  );
}

function CasesPage() {
  const { state, can, flashId } = usePortal();
  const { showCase, newCase, importCases } = useCaseActions();
  return (
    <>
      <PageHead title="Processos" sub="Carteira judicial e informações de acompanhamento.">
        {can('cases.import') && <button className="secondary" onClick={importCases}>Importar CSV do Excel</button>}
        {can('cases.manage') && <button className="primary" onClick={newCase}>＋ Novo processo</button>}
      </PageHead>
      <section className="panel">
        {state.cases.length ? (
          <div className="table-wrap"><table>
            <thead><tr><th>Processo</th><th>Tribunal / fase</th><th>Valor</th><th>Risco</th><th>Status</th></tr></thead>
            <tbody>{state.cases.map((c, i) => (
              <tr key={c.id} className={`row-in${c.id === flashId ? ' row-flash' : ''}`} style={stagger(i)}>
                <td><button className="row-link" onClick={() => showCase(c)}>{c.number}</button><small>{c.title}</small></td>
                <td>{c.court}<small>{c.phase}</small></td>
                <td>{money(c.claimValue)}</td>
                <td><Badge code={c.risk} /></td>
                <td><Badge code={c.status} /></td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <Blank>Nenhum processo disponível.</Blank>}
      </section>
    </>
  );
}

function TasksPage() {
  const { state, can, openModal } = usePortal();
  return (
    <>
      <PageHead title="Tarefas / Prazos" sub="Tarefas atribuídas e prazos de acompanhamento.">
        {can('tasks.manage') && <button className="primary" onClick={() => openModal('Nova tarefa', <TaskForm />)}>＋ Nova tarefa</button>}
      </PageHead>
      <section className="panel">
        {state.tasks.map((t, i) => <TaskRow key={t.id} t={t} index={i} />)}
        {!state.tasks.length && <Blank>Nenhuma tarefa cadastrada para você.</Blank>}
      </section>
    </>
  );
}

function DocumentsPage() {
  const { state } = usePortal();
  const { showRequest } = useRequestActions();
  const docs = state.requests.flatMap(d => d.files.map(f => ({ ...f, request: d })));
  return (
    <>
      <PageHead title="Documentos" sub="Arquivos das solicitações às quais você tem acesso."><NewRequestButton /></PageHead>
      <div className="notice">Para anexar documentos, abra uma solicitação existente ou crie uma nova.</div>
      <section className="panel">
        {docs.length ? (
          <div className="table-wrap"><table>
            <thead><tr><th>Arquivo</th><th>Solicitação</th><th>Tamanho</th><th></th></tr></thead>
            <tbody>{docs.map((f, i) => (
              <tr key={f.id} className="row-in" style={stagger(i)}>
                <td>{f.name}</td>
                <td><button className="row-link" onClick={() => showRequest(f.request)}>{f.request.code}</button></td>
                <td>{kb(f.size)}</td>
                <td><a className="text-button" href={f.url} download>Baixar</a></td>
              </tr>
            ))}</tbody>
          </table></div>
        ) : <Blank>Nenhum documento disponível.</Blank>}
      </section>
    </>
  );
}

function ReportsPage() {
  const { state } = usePortal();
  const byCategory = state.categories.map(c => ({ c, n: state.requests.filter(d => d.category.id === c.id).length })).filter(x => x.n);
  return (
    <>
      <PageHead title="Relatórios" sub="Indicadores calculados com os registros autorizados." />
      <Metrics />
      <div className="section-grid">
        <section className="panel"><div className="panel-body">
          <h2>Demandas por área</h2>
          {byCategory.length ? byCategory.map(({ c, n }, i) => (
            <div key={c.id} className="bar-item">
              <div className="bar-label"><span>{c.name}</span><strong><AnimatedNumber value={n} /></strong></div>
              <div className="bar-track" role="presentation">
                <div className="bar-fill bar-grow" style={{ width: `${(n / state.requests.length) * 100}%`, ...stagger(i) }} />
              </div>
            </div>
          )) : <p className="muted">Sem demandas para consolidar.</p>}
        </div></section>
        <section className="panel"><div className="panel-body">
          <h2>Risco da carteira</h2>
          {caseRisks.map(r => {
            const list = state.cases.filter(c => c.risk === r);
            return <div key={r} className="report-row"><span><Badge code={r} /></span><span>{list.length} · {money(list.reduce((n, c) => n + Number(c.claimValue), 0))}</span></div>;
          })}
          <p className="field-help">Soma dos valores das causas, não provisão contábil.</p>
        </div></section>
      </div>
    </>
  );
}

function AdminPage() {
  const { state, users, can, openModal, notify } = usePortal();
  if (!can('users.manage') && !can('audit.view')) return <PageHead title="Acesso restrito" sub="Área exclusiva da administração." />;
  return (
    <>
      <PageHead title="Administração" sub="Usuários, setores, convites e registros de auditoria.">
        {can('audit.view') && <button className="secondary" onClick={() => openModal('Auditoria', <AuditDialog />)}>Ver auditoria</button>}
        {can('users.manage') && <button className="secondary" onClick={() => openModal('Novo setor', <DepartmentForm />)}>＋ Novo setor</button>}
        {can('users.manage') && <button className="primary" onClick={() => openModal('Novo usuário', <UserForm />)}>＋ Novo usuário</button>}
      </PageHead>
      {can('users.manage') && (
        <>
          <div className="notice">Usuários MG Cred veem suas solicitações e as compartilhadas com eles. Processos ficam visíveis quando liberados a todos, ao setor do usuário ou ao próprio usuário.</div>
          <section className="panel"><div className="table-wrap"><table>
            <thead><tr><th>Usuário</th><th>Perfil</th><th>Situação</th><th>Ações</th></tr></thead>
            <tbody>{users.map((u, i) => (
              <tr key={u.id} className="row-in" style={stagger(i)}>
                <td>{u.name}<small>{u.email} · {u.department?.name ?? 'Sem setor'}</small></td>
                <td>{u.role.name}</td>
                <td><span className={`status-dot${u.active ? ' on' : ''}`}>{u.active ? 'Ativo' : 'Desativado'}</span></td>
                <td><div className="list-actions">
                  {u.active && <button className="secondary small-button" onClick={() => api<{ activationUrl: string }>(`/users/${u.id}/invite`, 'POST', {}).then(r => openModal('Link pessoal de ativação', <InviteLink url={r.activationUrl} />), e => notify(e.message, 'error'))}>Novo link de acesso</button>}
                  {u.id !== state.user.id && <button className="secondary small-button" onClick={() => openModal(u.active ? 'Desativar usuário' : 'Reativar usuário', <UserActiveConfirm user={u} />)}>{u.active ? 'Desativar' : 'Reativar'}</button>}
                </div></td>
              </tr>
            ))}</tbody>
          </table></div></section>
          <section className="panel"><div className="panel-body">
            <h2>Setores</h2>
            <p className="muted">{state.departments.map(d => d.name).join(' · ') || 'Nenhum setor cadastrado.'}</p>
          </div></section>
        </>
      )}
    </>
  );
}

function AccountPage() {
  const { state } = usePortal();
  const me = state.user;
  return (
    <>
      <PageHead title="Minha conta" sub={`${me.name} · ${me.email}`} />
      <section className="panel"><div className="panel-body">
        <h2>Alterar senha</h2>
        <AsyncForm onSubmit={async v => {
          if (v.password !== v.confirm) throw new Error('As senhas não coincidem.');
          await api('/password', 'POST', { current: v.current, password: v.password });
          location.reload();
        }}>
          <label>Senha atual<input type="password" name="current" required autoComplete="current-password" maxLength={128} /></label>
          <label>Nova senha<input type="password" name="password" required minLength={14} maxLength={128} autoComplete="new-password" /></label>
          <label>Confirme a nova senha<input type="password" name="confirm" required minLength={14} maxLength={128} autoComplete="new-password" /></label>
          <p className="field-help">Ao alterar a senha, todas as suas sessões serão encerradas.</p>
          <button className="primary space-top">Alterar senha</button>
        </AsyncForm>
      </div></section>
    </>
  );
}

export const pages: Record<string, ComponentType> = {
  dashboard: Dashboard,
  demandas: DemandsPage,
  processos: CasesPage,
  tarefas: TasksPage,
  documentos: DocumentsPage,
  relatorios: ReportsPage,
  governanca: GovernancePage,
  administracao: AdminPage,
  conta: AccountPage,
  busca: SearchPage,
};
