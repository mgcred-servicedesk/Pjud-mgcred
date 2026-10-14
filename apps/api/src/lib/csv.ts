import { caseRisks, caseStatuses, importColumns, labels, type CaseRisk, type CaseStatus } from '@mgcred/shared';
import { fail } from './errors.ts';
import { choice, date, optionalText, text } from './validate.ts';

export interface CaseInput {
  number: string; title: string; party: string | null; opponent: string | null; court: string | null;
  division: string | null; phase: string | null; status: CaseStatus; risk: CaseRisk; claimValue: string;
  nextDue: string | null; notes: string | null; clientVisible: boolean;
}

const fromLabel = (value: unknown) => {
  if (typeof value !== 'string') return value;
  const v = value.trim();
  return Object.entries(labels).find(([, l]) => l.toLowerCase() === v.toLowerCase())?.[0] ?? v;
};

function money(raw: unknown): string {
  let amount = String(raw ?? '0').trim().replace(/^R\$\s*/, '');
  if (amount === '') amount = '0';
  if (amount.includes(',')) amount = amount.replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(amount)) fail(400, 'Valor monetário inválido.');
  const cents = Math.round(Number(amount) * 100);
  if (!Number.isSafeInteger(cents) || cents > 1e14) fail(400, 'Valor monetário fora do limite.');
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

export function normalizeCase(v: Record<string, unknown>): CaseInput {
  const number = text(v.numero ?? v.number, 'Número', 40);
  if (!/^[A-Za-z0-9./ -]+$/.test(number)) fail(400, 'Número do processo inválido.');
  return {
    number,
    title: text(v.assunto ?? v.title, 'Assunto', 200),
    party: optionalText(v.parte ?? v.party, 'Parte', 150),
    opponent: optionalText(v.parte_contraria ?? v.opponent, 'Parte contrária', 150),
    court: optionalText(v.tribunal ?? v.court, 'Tribunal', 80),
    division: optionalText(v.vara ?? v.division, 'Vara', 120),
    phase: optionalText(v.fase ?? v.phase, 'Fase', 80),
    status: choice(fromLabel(v.status || 'ativo'), caseStatuses, 'Status'),
    risk: choice(fromLabel(v.risco ?? v.risk ?? 'nao_avaliado') || 'nao_avaliado', caseRisks, 'Risco'),
    claimValue: money(v.valor ?? v.value),
    nextDue: date(v.proximo_prazo ?? v.nextDue, true),
    notes: optionalText(v.observacoes ?? v.notes, 'Observações', 5000),
    clientVisible: v.clientVisible === true,
  };
}

export function parseCSV(raw: unknown) {
  if (typeof raw !== 'string' || raw.length > 1024 * 1024) fail(400, 'CSV deve ter no máximo 1 MB.');
  raw = raw.replace(/^\uFEFF/, '');
  const source = raw as string;
  const sep = (source.split(/\r?\n/)[0] ?? '').includes(';') ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false, closed = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i]!;
    if (quoted) {
      if (c === '"') {
        if (source[i + 1] === '"') { field += '"'; i++; } else { quoted = false; closed = true; }
      } else field += c;
      continue;
    }
    if (c === '"') { if (field || closed) fail(400, 'CSV com aspas inválidas.'); quoted = true; continue; }
    if (c === sep || c === '\n' || c === '\r') {
      row.push(field); field = ''; closed = false;
      if (c !== sep) {
        if (c === '\r' && source[i + 1] === '\n') i++;
        if (row.some(x => x !== '')) rows.push(row);
        row = [];
      }
      continue;
    }
    if (closed && c !== ' ') fail(400, 'CSV inválido após aspas.');
    if (!closed) field += c;
  }
  if (quoted) fail(400, 'CSV com aspas não fechadas.');
  if (field || row.length) { row.push(field); rows.push(row); }
  if (rows.length < 2 || rows.length > 501) fail(400, 'Importe entre 1 e 500 processos por arquivo.');
  const headers = rows.shift()!.map(x => x.trim().toLowerCase());
  const known: readonly string[] = importColumns;
  if (headers.length !== new Set(headers).size || !headers.includes('numero') || !headers.includes('assunto') || headers.some(h => !known.includes(h)))
    fail(400, 'Use as colunas do modelo CSV: numero e assunto são obrigatórias.');
  const errors: Array<{ line: number | null; message: string }> = [];
  const items: CaseInput[] = [];
  const seen = new Set<string>();
  rows.forEach((r, i) => {
    try {
      if (r.length !== headers.length) fail(400, 'Quantidade de colunas diferente do cabeçalho.');
      const item = normalizeCase(Object.fromEntries(headers.map((h, j) => [h, r[j]])));
      if (seen.has(item.number)) fail(400, 'Número repetido no arquivo.');
      seen.add(item.number);
      items.push(item);
    } catch (e) {
      errors.push({ line: i + 2, message: (e as Error).message });
    }
  });
  return { items, errors, total: rows.length };
}
