import { useCallback, useEffect, useState } from 'react';
import { caseRisks, caseStatuses, label, type CaseAccessEntry, type CaseItem, type ImportPreview } from '@mgcred/shared';
import { api } from '../api.ts';
import { dateStr, money } from '../format.ts';
import { AsyncForm, Options, Skeleton, usePortal } from '../portal.tsx';

export function useCaseActions() {
  const { openModal } = usePortal();
  return {
    showCase: (c: { id: string; number: string }) => openModal(c.number, <CaseDialog id={c.id} />),
    newCase: () => openModal('Novo processo', <CaseForm />),
    importCases: () => openModal('Importar processos do Excel', <ImportDialog />),
  };
}

export function CaseDialog({ id }: { id: string }) {
  const { state, can } = usePortal();
  const c = state.cases.find(x => x.id === id);
  if (!c) return <p className="muted">Processo indisponível.</p>;
  if (can('cases.manage')) return <><CaseForm current={c} /><CaseAccess caseItem={c} /></>;
  const rows: Array<[string, string | null]> = [
    ['Parte', c.party], ['Parte contrária', c.opponent], ['Tribunal', c.court], ['Vara', c.division], ['Fase', c.phase],
    ['Status', label(c.status)], ['Risco', label(c.risk)], ['Valor', money(c.claimValue)], ['Próximo prazo', dateStr(c.nextDue)],
  ];
  return (
    <>
      <h3>{c.title}</h3>
      <div className="detail-data space-top">{rows.map(([k, v]) => <div key={k}><small>{k}</small>{v || '—'}</div>)}</div>
      <p className="detail-description">{c.notes}</p>
    </>
  );
}

function CaseForm({ current }: { current?: CaseItem }) {
  const { refresh, notify, closeModal, flash } = usePortal();
  return (
    <AsyncForm key={current?.version} onSubmit={async (v, form) => {
      const payload = { ...v, clientVisible: (form.elements.namedItem('clientVisible') as HTMLInputElement).checked, version: current?.version };
      const id = current
        ? (await api<{ id: string }>('/cases/' + current.id, 'PATCH', payload)).id
        : (await api<{ id: string }>('/cases', 'POST', payload)).id;
      if (!current) closeModal();
      await refresh();
      flash(id);
      notify('Processo salvo.');
    }}>
      <div className="form-grid">
        <label>Número<input name="number" required maxLength={40} defaultValue={current?.number} /></label>
        <label>Assunto<input name="title" required maxLength={200} defaultValue={current?.title} /></label>
        <label>Parte<input name="party" maxLength={150} defaultValue={current?.party ?? ''} /></label>
        <label>Parte contrária<input name="opponent" maxLength={150} defaultValue={current?.opponent ?? ''} /></label>
        <label>Tribunal<input name="court" maxLength={80} defaultValue={current?.court ?? ''} /></label>
        <label>Vara<input name="division" maxLength={120} defaultValue={current?.division ?? ''} /></label>
        <label>Fase<input name="phase" maxLength={80} defaultValue={current?.phase ?? ''} /></label>
        <label>Status<select name="status" defaultValue={current?.status ?? 'ativo'}><Options list={caseStatuses} /></select></label>
        <label>Risco<select name="risk" defaultValue={current?.risk ?? 'nao_avaliado'}><Options list={caseRisks} /></select></label>
        <label>Valor da causa (R$)<input name="value" inputMode="decimal" required defaultValue={current?.claimValue ?? '0.00'} /></label>
        <label>Próximo prazo<input type="date" name="nextDue" defaultValue={current?.nextDue ?? ''} /></label>
      </div>
      <label>Observações<textarea name="notes" rows={3} maxLength={5000} defaultValue={current?.notes ?? ''} /></label>
      <label className="check-label"><input type="checkbox" name="clientVisible" defaultChecked={current?.clientVisible} />Disponibilizar este processo a todos os usuários ativos da MG Cred</label>
      <div className="dialog-actions"><button className="primary">Salvar processo</button></div>
    </AsyncForm>
  );
}

function CaseAccess({ caseItem }: { caseItem: CaseItem }) {
  const { state, users, notify } = usePortal();
  const [access, setAccess] = useState<CaseAccessEntry[] | null>(null);
  const load = useCallback(() => api<{ access: CaseAccessEntry[] }>(`/cases/${caseItem.id}/access`).then(r => setAccess(r.access), e => notify(e.message, 'error')), [caseItem.id, notify]);
  useEffect(() => { load(); }, [load]);
  const change = async (target: { userId?: string; departmentId?: string }, allow: boolean) => {
    await api(`/cases/${caseItem.id}/access`, 'POST', { ...target, allow });
    await load();
    notify(allow ? 'Acesso concedido.' : 'Acesso removido.');
  };
  const granted = access ?? [];
  const departments = state.departments.filter(d => !granted.some(a => a.department?.id === d.id));
  const candidates = users.filter(u => u.active && !u.permissions.includes('cases.view_all') && !granted.some(a => a.user?.id === u.id));
  return (
    <fieldset className="fieldset">
      <legend>Acesso ao processo</legend>
      <p className="field-help">{caseItem.clientVisible ? 'Este processo está disponível a todos os usuários ativos da MG Cred.' : 'Libere este processo para setores ou usuários específicos.'}</p>
      {access === null ? <Skeleton lines={2} /> : <ul className="access-list">
        {granted.map(a => (
          <li key={a.id} className="item-in">{a.department ? `Setor: ${a.department.name}` : `Usuário: ${a.user?.name}`}
            <button type="button" className="text-button" onClick={() => change(a.department ? { departmentId: a.department.id } : { userId: a.user!.id }, false).catch(e => notify(e.message, 'error'))}>Remover acesso</button>
          </li>
        ))}
        {!granted.length && <li className="muted fade-in">Nenhuma liberação específica.</li>}
      </ul>}
      <AsyncForm className="inline-form" onSubmit={v => change({ departmentId: v.departmentId }, true)}>
        <label>Setor<select name="departmentId" required><option value="">Selecione</option>{departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
        <button className="secondary">Liberar ao setor</button>
      </AsyncForm>
      <AsyncForm className="inline-form" onSubmit={v => change({ userId: v.userId }, true)}>
        <label>Usuário<select name="userId" required><option value="">Selecione</option>{candidates.map(u => <option key={u.id} value={u.id}>{u.name} · {u.department?.name ?? u.role.name}</option>)}</select></label>
        <button className="secondary">Liberar ao usuário</button>
      </AsyncForm>
    </fieldset>
  );
}

function ImportDialog() {
  const { refresh, notify, closeModal } = usePortal();
  const [result, setResult] = useState<(ImportPreview & { csv: string }) | null>(null);
  return (
    <>
      <p className="modal-caption">No Excel, salve a planilha como CSV UTF-8. Use o modelo abaixo e mantenha os nomes das colunas. Até 500 processos por importação.</p>
      <a className="text-button" href="/api/import/template" download>Baixar modelo CSV</a>
      <AsyncForm onSubmit={async (_v, form) => {
        const file = (form.elements.namedItem('csv') as HTMLInputElement).files?.[0];
        if (!file || file.size > 1024 * 1024) throw new Error('Selecione um CSV de até 1 MB.');
        const csv = await file.text();
        setResult({ ...(await api<ImportPreview>('/import/preview', 'POST', { csv })), csv });
      }}>
        <label>Arquivo CSV<input type="file" name="csv" accept=".csv" required /></label>
        <button className="secondary space-top">Validar e visualizar</button>
      </AsyncForm>
      {result && (
        <div className="swap-in" key={result.hash}>
          <div className={`space-top ${result.errors.length ? 'error-banner' : 'result-summary'}`}>{result.total} linha(s) · {result.errors.length} erro(s)</div>
          {result.errors.length ? (
            <ul>{result.errors.map((e, i) => <li key={i}>{e.line ? `Linha ${e.line}: ` : ''}{e.message}</li>)}</ul>
          ) : (
            <>
              <p>Os processos serão importados com acesso exclusivo do Jurídico. Você poderá liberar cada processo depois.</p>
              <div className="table-wrap"><table>
                <thead><tr><th>Número</th><th>Assunto</th><th>Valor</th></tr></thead>
                <tbody>{result.items.slice(0, 20).map(c => <tr key={c.number}><td>{c.number}</td><td>{c.title}</td><td>{money(c.claimValue)}</td></tr>)}</tbody>
              </table></div>
              <p className="field-help">Prévia das primeiras 20 linhas.</p>
              <AsyncForm onSubmit={async () => {
                const r = await api<{ count: number }>('/import/confirm', 'POST', { csv: result.csv, hash: result.hash });
                closeModal();
                await refresh();
                notify(`${r.count} processos importados.`);
              }}>
                <button className="primary">Confirmar {result.items.length} processos</button>
              </AsyncForm>
            </>
          )}
        </div>
      )}
    </>
  );
}
