import { useEffect, useState } from 'react';
import { priorities, type AuditEvent, type Role, type UserSummary } from '@mgcred/shared';
import { api } from '../api.ts';
import { actionLabel, datetime } from '../format.ts';
import { AsyncForm, Options, Skeleton, usePortal } from '../portal.tsx';
import { stagger } from '../pages/requests.tsx';

export function TaskForm() {
  const { state, users, refresh, notify, closeModal } = usePortal();
  return (
    <AsyncForm onSubmit={async v => {
      await api('/tasks', 'POST', { title: v.title, description: v.description, dueDate: v.dueDate, priority: v.priority, assigneeId: v.assigneeId || null, requestId: v.requestId || null, caseId: v.caseId || null });
      closeModal();
      await refresh();
      notify('Tarefa criada.');
    }}>
      <label>Título<input name="title" required maxLength={200} /></label>
      <label>Descrição<textarea name="description" maxLength={3000} rows={3} /></label>
      <div className="form-grid">
        <label>Prazo<input name="dueDate" type="date" required /></label>
        <label>Prioridade<select name="priority"><Options list={priorities} /></select></label>
      </div>
      <label>Responsável<select name="assigneeId"><option value="">Não atribuído</option>{users.filter(u => u.active).map(u => <option key={u.id} value={u.id}>{u.name} · {u.department?.name ?? u.role.name}</option>)}</select></label>
      <label>Solicitação relacionada<select name="requestId"><option value="">Nenhuma</option>{state.requests.map(d => <option key={d.id} value={d.id}>{d.code} · {d.subject}</option>)}</select></label>
      <label>Processo relacionado<select name="caseId"><option value="">Nenhum</option>{state.cases.map(c => <option key={c.id} value={c.id}>{c.number}</option>)}</select></label>
      <p className="field-help">O responsável precisa ter acesso à solicitação ou ao processo relacionado.</p>
      <div className="dialog-actions"><button className="primary">Criar tarefa</button></div>
    </AsyncForm>
  );
}

export function InviteLink({ url }: { url: string }) {
  return (
    <>
      <p>Compartilhe este link apenas com o usuário correspondente. Ele permitirá definir ou redefinir a senha e expira em 24 horas.</p>
      <div className="secret-link">{url}</div>
      <p className="field-help">Selecione e copie o endereço. Após a ativação, o link deixa de funcionar.</p>
    </>
  );
}

export function UserForm() {
  const { state, refresh, openModal } = usePortal();
  const [roles, setRoles] = useState<Role[]>([]);
  useEffect(() => { api<{ roles: Role[] }>('/roles').then(r => setRoles(r.roles)); }, []);
  return (
    <AsyncForm onSubmit={async v => {
      const r = await api<{ activationUrl: string }>('/users', 'POST', { name: v.name, email: v.email, departmentId: v.departmentId || null, roleId: v.roleId });
      await refresh();
      openModal('Link pessoal de ativação', <InviteLink url={r.activationUrl} />);
    }}>
      <label>Nome<input name="name" required maxLength={100} /></label>
      <label>E-mail<input name="email" type="email" required maxLength={254} /></label>
      <label>Setor<select name="departmentId"><option value="">Sem setor</option>{state.departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
      <label>Perfil<select name="roleId" required>{roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
      <p className="field-help">Será gerado um link de ativação válido por 24 horas. Encaminhe-o pessoalmente por um canal seguro. O portal não envia e-mails automaticamente.</p>
      <div className="dialog-actions"><button className="primary">Criar usuário</button></div>
    </AsyncForm>
  );
}

export function UserActiveConfirm({ user }: { user: UserSummary }) {
  const { refresh, notify, closeModal } = usePortal();
  return (
    <AsyncForm onSubmit={async () => {
      await api('/users/' + user.id, 'PATCH', { active: !user.active });
      closeModal();
      await refresh();
      notify('Situação do usuário atualizada.');
    }}>
      <p>{user.name} · {user.email}</p>
      <p>{user.active ? 'As sessões desse usuário serão encerradas imediatamente.' : 'O usuário poderá entrar novamente ou receber um novo link de acesso.'}</p>
      <div className="dialog-actions"><button className="secondary" type="button" onClick={closeModal}>Cancelar</button><button className="primary">Confirmar</button></div>
    </AsyncForm>
  );
}

export function DepartmentForm() {
  const { refresh, notify, closeModal } = usePortal();
  return (
    <AsyncForm onSubmit={async v => {
      await api('/departments', 'POST', { name: v.name });
      closeModal();
      await refresh();
      notify('Setor cadastrado.');
    }}>
      <label>Nome do setor<input name="name" required maxLength={80} /></label>
      <div className="dialog-actions"><button className="primary">Cadastrar setor</button></div>
    </AsyncForm>
  );
}

export function AuditDialog() {
  const { notify } = usePortal();
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const load = (before = 0) => api<{ events: AuditEvent[]; next: number | null }>('/audit' + (before ? '?before=' + before : ''))
    .then(r => { setEvents(e => (before && e ? [...e, ...r.events] : r.events)); setNext(r.next); }, e => notify(e.message, 'error'));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!events) return <Skeleton lines={6} />;
  return (
    <>
      <div className="table-wrap"><table>
        <thead><tr><th>Data</th><th>Usuário</th><th>Ação</th><th>Registro</th></tr></thead>
        <tbody>{events.map((e, i) => <tr key={e.id} className="row-in" style={stagger(i % 100)}><td>{datetime(e.createdAt)}</td><td>{e.actor ?? 'Sistema'}</td><td>{actionLabel(e.action)}</td><td>{e.entityLabel ?? e.entityType}</td></tr>)}</tbody>
      </table></div>
      {next && <button className="secondary space-top" onClick={() => load(next)}>Eventos anteriores</button>}
    </>
  );
}
