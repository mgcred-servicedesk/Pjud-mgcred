import { useCallback, useEffect, useState } from 'react';
import { label, priorities, requestStatuses, upload, type RequestDetail as Detail } from '@mgcred/shared';
import { api } from '../api.ts';
import { actionLabel, datetime, kb } from '../format.ts';
import { AsyncForm, Badge, Options, Skeleton, usePortal } from '../portal.tsx';

export function RequestForm() {
  const { state, can, refresh, notify, openModal, flash } = usePortal();
  const me = state.user;
  return (
    <AsyncForm onSubmit={async v => {
      const r = await api<{ id: string; code: string }>('/requests', 'POST', { subject: v.subject, description: v.description, categoryId: v.categoryId, priority: v.priority, departmentId: v.departmentId || undefined });
      await refresh();
      flash(r.id);
      openModal(`${r.code} · ${v.subject}`, <RequestDetail id={r.id} />);
      notify(`Solicitação ${r.code} criada.`);
    }}>
      <label>Assunto<input name="subject" required maxLength={140} /></label>
      <div className="form-grid">
        <label>Categoria<select name="categoryId">{state.categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label>Prioridade<select name="priority"><Options list={priorities} /></select></label>
      </div>
      <label>Descrição<textarea name="description" rows={5} required maxLength={5000} /></label>
      {can('requests.set_department')
        ? <label>Setor<select name="departmentId" defaultValue={me.department?.id ?? ''}><option value="">Sem setor</option>{state.departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
        : <p className="muted">Solicitante: {me.name} · {me.department?.name ?? 'Sem setor'}</p>}
      <p className="field-help">Depois de criar, você poderá anexar documentos na própria solicitação.</p>
      <div className="dialog-actions"><button className="primary">Criar solicitação</button></div>
    </AsyncForm>
  );
}

export function RequestDetail({ id }: { id: string }) {
  const { users, can, refresh, notify, flash } = usePortal();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [seenMessages, setSeenMessages] = useState<number | null>(null);
  const load = useCallback(() => api<Detail>('/requests/' + id).then(setD, e => setError(e.message)), [id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (d && seenMessages === null) setSeenMessages(d.messages.length); }, [d, seenMessages]);
  const after = async (message: string) => { await refresh(); await load(); flash(id); notify(message); };

  if (error) return <p className="form-error">{error}</p>;
  if (!d) return <div className="detail-skeleton"><Skeleton lines={2} /><span className="skeleton skeleton-block" /><Skeleton lines={4} /></div>;
  const managers = users.filter(u => u.active && u.permissions.includes('requests.manage'));
  const shareable = users.filter(u => u.active && !u.permissions.includes('requests.view_all') && u.id !== d.requester.id && !d.access.some(a => a.id === u.id));

  return (
    <>
      <div className="detail-meta"><Badge code={d.status} /> <Badge code={d.priority} /> <span>{d.category.name}</span></div>
      <p className="detail-description">{d.description}</p>
      <div className="detail-data">
        <div><small>Solicitante</small>{d.requester.name}</div>
        <div><small>Setor</small>{d.department?.name ?? '—'}</div>
        <div><small>Responsável</small>{d.owner?.name ?? 'Jurídico'}</div>
        <div><small>Abertura</small>{datetime(d.createdAt)}</div>
      </div>

      {can('requests.manage') && (
        <AsyncForm key={d.version} onSubmit={async v => {
          if (v.status !== d.status && !confirm(`Alterar o status para “${label(v.status!)}”?`)) return;
          await api('/requests/' + d.id, 'PATCH', { status: v.status, priority: v.priority, ownerId: v.ownerId || null, version: d.version });
          await after('Acompanhamento salvo.');
        }}>
          <div className="form-grid">
            <label>Status<select name="status" defaultValue={d.status}><Options list={requestStatuses} /></select></label>
            <label>Prioridade<select name="priority" defaultValue={d.priority}><Options list={priorities} /></select></label>
          </div>
          <label>Responsável<select name="ownerId" defaultValue={d.owner?.id ?? ''}>
            <option value="">Não atribuído</option>
            {managers.map(u => <option key={u.id} value={u.id}>{u.name} · {u.department?.name ?? u.role.name}</option>)}
          </select></label>
          <button className="secondary space-top">Salvar acompanhamento</button>
        </AsyncForm>
      )}

      <h3 className="space-top">Documentos</h3>
      <ul className="files">
        {d.files.length ? d.files.map(f => <li key={f.id} className="item-in"><a href={f.url} download>↓ {f.name}</a> <span className="timestamp">{kb(f.size)}</span></li>) : <li className="muted">Nenhum documento anexado.</li>}
      </ul>
      <AsyncForm onSubmit={async (_v, form) => {
        const input = form.elements.namedItem('file') as HTMLInputElement;
        const file = input.files?.[0];
        if (!file || !file.size || file.size > upload.maxBytes) throw new Error('Escolha um arquivo entre 1 byte e 5 MB.');
        const data = new FormData();
        data.append('file', file, file.name);
        await api(`/requests/${d.id}/files`, 'POST', data);
        form.reset();
        await after('Documento salvo.');
      }}>
        <label>Anexar documento<input name="file" type="file" required accept={upload.extensions.join(',')} /></label>
        <p className="upload-help">Até 5 MB por arquivo; máximo de {upload.maxPerRequest} anexos. PDF, DOCX, XLSX, TXT, CSV, PNG ou JPG.</p>
        <button className="secondary">Enviar documento</button>
      </AsyncForm>

      <h3 className="space-top">Mensagens</h3>
      <ul className="history">
        {d.messages.length ? d.messages.map((m, i) => (
          <li key={m.id} className={`${m.isInternal ? 'internal' : ''}${seenMessages !== null && i >= seenMessages ? ' item-in' : ''}`}>
            <strong>{m.author} {m.isInternal && <span className="badge internal">Interna</span>}</strong>
            <small>{datetime(m.createdAt)}</small>
            <p className="message-body">{m.body}</p>
          </li>
        )) : <li>Nenhuma mensagem.</li>}
      </ul>
      <AsyncForm onSubmit={async (v, form) => {
        await api(`/requests/${d.id}/messages`, 'POST', { body: v.body, isInternal: v.isInternal === 'on' });
        form.reset();
        await after('Mensagem salva.');
      }}>
        <label>Nova mensagem<textarea name="body" required maxLength={5000} rows={3} /></label>
        {can('messages.internal') && <label className="check-label"><input type="checkbox" name="isInternal" />Mensagem interna (visível apenas ao Jurídico)</label>}
        <div className="dialog-actions"><button className="primary">Enviar mensagem</button></div>
      </AsyncForm>

      {can('requests.share') && (
        <fieldset className="fieldset">
          <legend>Compartilhamento da solicitação</legend>
          <p className="field-help">O solicitante e o Jurídico já têm acesso. Acrescente outros usuários apenas quando necessário.</p>
          <ul className="access-list">
            {d.access.map(u => (
              <li key={u.id}>{u.name}
                <button className="text-button" type="button" onClick={() => api(`/requests/${d.id}/access`, 'POST', { userId: u.id, allow: false }).then(() => after('Acesso removido.'), e => notify(e.message, 'error'))}>Remover acesso</button>
              </li>
            ))}
          </ul>
          <AsyncForm className="inline-form" onSubmit={async v => {
            await api(`/requests/${d.id}/access`, 'POST', { userId: v.userId, allow: true });
            await after('Acesso concedido.');
          }}>
            <label>Usuário<select name="userId" required><option value="">Selecione</option>{shareable.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>
            <button className="secondary">Compartilhar</button>
          </AsyncForm>
        </fieldset>
      )}

      <h3 className="space-top">Histórico</h3>
      <ul className="history">
        {d.history.map(h => {
          const details = Object.entries(h.details).filter(([k]) => !['internal', 'userId', 'documentId', 'ownerId'].includes(k));
          return (
            <li key={h.id}>
              <small>{datetime(h.createdAt)} · {h.actor ?? 'Sistema'}</small>{actionLabel(h.action)}
              {details.length > 0 && <p className="timestamp">{details.map(([k, v]) => `${k}: ${typeof v === 'string' ? label(v) : String(v)}`).join(' · ')}</p>}
            </li>
          );
        })}
      </ul>
    </>
  );
}
