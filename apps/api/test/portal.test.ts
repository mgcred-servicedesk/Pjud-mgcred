import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq, sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { hashPassword, digest } from '../src/lib/crypto.ts';
import { parseCSV } from '../src/lib/csv.ts';
import { clientIp, type AppContext } from '../src/context.ts';
import { cases, departments, requests, rolePermissions, roles, sessions } from '../src/db/schema.ts';
import { client, createTestDatabase, seedUser, startApp, type Session } from './helpers.ts';

const pw = 'Frase de teste descartavel 2026!';
let database: Awaited<ReturnType<typeof createTestDatabase>>;
let app: FastifyInstance, ctx: AppContext, base = '';
let admin: Session, alice: Session, bob: Session;
let adminRow: { id: string; email: string }, aliceRow: { id: string; email: string; departmentId: string | null }, bobRow: { id: string; email: string };
let requestId = '', documentId = '', contratos = '';
let webDir = '';
const { call, login, upload } = client(() => base);

beforeAll(async () => {
  database = await createTestDatabase();
  webDir = await mkdtemp(join(tmpdir(), 'mgcred-web-'));
  await writeFile(join(webDir, 'index.html'), '<!doctype html><title>Portal</title>');
  ({ app, ctx, base } = await startApp(database.url, { webDist: webDir }));
  const passwordHash = await hashPassword(pw);
  adminRow = await seedUser(database.db, { email: 'admin@example.test', name: 'Admin teste', role: 'admin_juridico', department: 'Jurídico', passwordHash });
  aliceRow = await seedUser(database.db, { email: 'alice@example.test', name: 'Alice teste', role: 'usuario_mgcred', department: 'Financeiro', passwordHash });
  bobRow = await seedUser(database.db, { email: 'bob@example.test', name: 'Bob teste', role: 'usuario_mgcred', department: 'Operações', passwordHash });
  admin = await login(adminRow.email, pw);
  alice = await login(aliceRow.email, pw);
  bob = await login(bobRow.email, pw);
  contratos = (await call('/state', { session: alice })).body.categories.find((c: { name: string }) => c.name === 'Contratos').id;
});

afterAll(async () => {
  await app?.close();
  await database?.drop();
});

describe('Portal Jurídico MG Cred — API', () => {
  test('web pública carrega com CSP; API exige sessão; arquivos ocultos não são servidos', async () => {
    const html = await fetch(base + '/');
    expect(html.status).toBe(200);
    expect(html.headers.get('content-security-policy')).toMatch(/frame-ancestors 'none'/);
    expect((await fetch(base + '/.env')).status).toBe(404);
    expect((await call('/state')).status).toBe(401);
  });

  test('origem e CSRF bloqueiam gravações não autorizadas', async () => {
    expect((await call('/requests', { method: 'POST', session: alice, headers: { origin: 'https://evil.test' }, body: {} })).status).toBe(403);
    expect((await call('/requests', { method: 'POST', session: alice, headers: { 'x-csrf-token': 'bad' }, body: {} })).status).toBe(403);
  });

  test('criação de demanda persiste e o solicitante não pode ser falsificado', async () => {
    const r = await call('/requests', { method: 'POST', session: alice, body: { subject: 'Contrato de teste <script>', description: 'Conteúdo de teste', categoryId: contratos, priority: 'alta', requesterId: bobRow.id, departmentId: crypto.randomUUID() } });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    requestId = r.body.id;
    expect(r.body.code).toMatch(/^JUR-\d{4}-001$/);
    const [record] = await database.db.select().from(requests).where(eq(requests.id, requestId));
    expect(record!.requesterId).toBe(aliceRow.id);
    expect(record!.departmentId).toBe(aliceRow.departmentId);
    expect(record!.ownerId).toBe(adminRow.id);
  });

  test('acesso cruzado é negado na lista, na ficha e nas mensagens', async () => {
    expect((await call('/state', { session: bob })).body.requests).toHaveLength(0);
    expect((await call('/requests/' + requestId, { session: bob })).status).toBe(404);
    expect((await call(`/requests/${requestId}/messages`, { method: 'POST', session: bob, body: { body: 'não permitido' } })).status).toBe(404);
    expect((await call('/users', { session: alice })).status).toBe(403);
  });

  test('cliente não altera status; administrador usa concorrência otimista', async () => {
    expect((await call('/requests/' + requestId, { method: 'PATCH', session: alice, body: { version: 1, status: 'concluida' } })).status).toBe(403);
    const results = await Promise.all(['em_analise', 'concluida'].map(status => call('/requests/' + requestId, { method: 'PATCH', session: admin, body: { version: 1, status } })));
    expect(results.map(r => r.status).sort()).toEqual([200, 409]);
  });

  test('mensagens persistem com histórico; auditoria é somente inclusão', async () => {
    expect((await call(`/requests/${requestId}/messages`, { method: 'POST', session: alice, body: { body: 'Mensagem persistente' } })).status).toBe(201);
    const detail = await call('/requests/' + requestId, { session: admin });
    expect(detail.body.messages[0].body).toBe('Mensagem persistente');
    expect(detail.body.history.some((e: { action: string }) => e.action === 'mensagem.registrada')).toBe(true);
    await expect(database.db.execute(sql`DELETE FROM audit_log`)).rejects.toThrow();
    await expect(database.db.execute(sql`UPDATE audit_log SET action = 'x'`)).rejects.toThrow();
  });

  test('mensagens internas ficam ocultas para o solicitante, inclusive no histórico', async () => {
    expect((await call(`/requests/${requestId}/messages`, { method: 'POST', session: admin, body: { body: 'Nota interna do Jurídico', isInternal: true } })).status).toBe(201);
    expect((await call(`/requests/${requestId}/messages`, { method: 'POST', session: alice, body: { body: 'tentativa', isInternal: true } })).status).toBe(403);
    const forAlice = (await call('/requests/' + requestId, { session: alice })).body;
    expect(forAlice.messages.map((m: { body: string }) => m.body)).toEqual(['Mensagem persistente']);
    expect(forAlice.history.some((e: { action: string }) => e.action === 'mensagem.interna')).toBe(false);
    const forAdmin = (await call('/requests/' + requestId, { session: admin })).body;
    expect(forAdmin.messages).toHaveLength(2);
    expect(forAdmin.messages[1].isInternal).toBe(true);
  });

  test('anexos validam tipo e cada download é autorizado', async () => {
    expect((await upload(requestId, 'script.html', '<script>', alice)).status).toBe(400);
    expect((await upload(requestId, 'falso.pdf', 'not pdf', alice)).status).toBe(400);
    const good = await upload(requestId, 'documento.txt', 'Anexo persistente', alice);
    expect(good.status, JSON.stringify(good.body)).toBe(201);
    documentId = good.body.id;
    expect((await call('/documents/' + documentId, { session: bob })).status).toBe(404);
    expect((await call('/documents/' + documentId)).status).toBe(401);
    const file = await call('/documents/' + documentId, { session: admin });
    expect(file.body).toBe('Anexo persistente');
    expect(file.headers.get('content-disposition')).toMatch(/^attachment/);
  });

  test('compartilhamento concede acesso; revogação oculta tarefas e documentos', async () => {
    expect((await call(`/requests/${requestId}/access`, { method: 'POST', session: admin, body: { userId: bobRow.id, allow: true } })).status).toBe(200);
    expect((await call('/requests/' + requestId, { session: bob })).status).toBe(200);
    const task = await call('/tasks', { method: 'POST', session: admin, body: { title: 'Tarefa compartilhada', dueDate: '2027-01-10', priority: 'normal', assigneeId: bobRow.id, requestId } });
    expect(task.status, JSON.stringify(task.body)).toBe(201);
    expect((await call('/state', { session: bob })).body.tasks).toHaveLength(1);
    await call(`/requests/${requestId}/access`, { method: 'POST', session: admin, body: { userId: bobRow.id, allow: false } });
    expect((await call('/state', { session: bob })).body.tasks).toHaveLength(0);
    expect((await call('/documents/' + documentId, { session: bob })).status).toBe(404);
    expect((await call('/tasks/' + task.body.id, { method: 'PATCH', session: bob, body: { done: true, version: 1 } })).status).toBe(404);
    const done = await call('/tasks/' + task.body.id, { method: 'PATCH', session: admin, body: { done: true, version: 1 } });
    expect(done.status).toBe(200);
  });

  test('processo nasce interno; só aparece ao cliente quando liberado', async () => {
    const c = await call('/cases', { method: 'POST', session: admin, body: { number: 'TEST-001', title: 'Processo privado', risk: 'baixo', value: '1.234,56' } });
    expect(c.status, JSON.stringify(c.body)).toBe(201);
    expect((await call('/state', { session: alice })).body.cases).toHaveLength(0);
    expect((await call('/cases/' + c.body.id, { method: 'PATCH', session: admin, body: { number: 'TEST-001', title: 'Processo liberado', risk: 'baixo', value: '1234.56', clientVisible: true, version: 1 } })).status).toBe(200);
    const visible = (await call('/state', { session: alice })).body.cases;
    expect(visible).toHaveLength(1);
    expect(visible[0].claimValue).toBe('1234.56');
  });

  test('processo pode ser liberado por setor e por usuário', async () => {
    const c = await call('/cases', { method: 'POST', session: admin, body: { number: 'TEST-002', title: 'Processo do Financeiro' } });
    const caseId = c.body.id;
    const visibleTo = async (s: Session) => (await call('/state', { session: s })).body.cases.some((x: { id: string }) => x.id === caseId);
    expect((await call(`/cases/${caseId}/access`, { method: 'POST', session: alice, body: { departmentId: aliceRow.departmentId, allow: true } })).status).toBe(403);
    expect((await call(`/cases/${caseId}/access`, { method: 'POST', session: admin, body: { departmentId: aliceRow.departmentId, userId: bobRow.id, allow: true } })).status).toBe(400);
    expect((await call(`/cases/${caseId}/access`, { method: 'POST', session: admin, body: { departmentId: aliceRow.departmentId, allow: true } })).status).toBe(200);
    expect((await call(`/cases/${caseId}/access`, { method: 'POST', session: admin, body: { departmentId: aliceRow.departmentId, allow: true } })).status).toBe(200);
    expect(await visibleTo(alice)).toBe(true);
    expect(await visibleTo(bob)).toBe(false);
    await call(`/cases/${caseId}/access`, { method: 'POST', session: admin, body: { userId: bobRow.id, allow: true } });
    expect(await visibleTo(bob)).toBe(true);
    const access = (await call(`/cases/${caseId}/access`, { session: admin })).body.access;
    expect(access).toHaveLength(2);
    await call(`/cases/${caseId}/access`, { method: 'POST', session: admin, body: { departmentId: aliceRow.departmentId, allow: false } });
    expect(await visibleTo(alice)).toBe(false);
    expect(await visibleTo(bob)).toBe(true);
  });

  test('CSV aceita células entre aspas e rejeita linhas malformadas e datas inválidas', () => {
    const parsed = parseCSV('numero;assunto;valor;proximo_prazo;risco\r\nTEST-CSV;"Contrato; revisão";"2.500,50";2027-01-31;Médio');
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.items[0]!.title).toBe('Contrato; revisão');
    expect(parsed.items[0]!.claimValue).toBe('2500.50');
    expect(parsed.items[0]!.risk).toBe('medio');
    expect(parseCSV('numero;assunto;proximo_prazo\nT1;Assunto;2026-02-30').errors).toHaveLength(1);
    expect(() => parseCSV('numero;assunto\nT1;"sem fechamento')).toThrow();
  });

  test('importação CSV tem prévia, proteção contra duplicidade e é atômica', async () => {
    const csv = 'numero;assunto;valor\nIMPORT-001;Importado;12,50\nIMPORT-002;Outro;20,00';
    const preview = await call('/import/preview', { method: 'POST', session: admin, body: { csv } });
    expect(preview.status).toBe(200);
    expect(preview.body.errors).toHaveLength(0);
    const imported = await call('/import/confirm', { method: 'POST', session: admin, body: { csv, hash: preview.body.hash } });
    expect(imported.status).toBe(201);
    expect(imported.body.count).toBe(2);
    expect((await call('/import/confirm', { method: 'POST', session: admin, body: { csv, hash: preview.body.hash } })).status).toBe(409);
    const conflict = 'numero;assunto\nROLLBACK-001;Não deve salvar\nIMPORT-001;Duplicado';
    const p = await call('/import/preview', { method: 'POST', session: admin, body: { csv: conflict } });
    expect(p.body.errors).toHaveLength(1);
    expect((await call('/import/confirm', { method: 'POST', session: admin, body: { csv: conflict, hash: p.body.hash } })).status).toBe(409);
    expect(await database.db.select().from(cases).where(eq(cases.number, 'ROLLBACK-001'))).toHaveLength(0);
  });

  test('convite é de uso único e a desativação encerra as sessões', async () => {
    const roleId = (await call('/roles', { session: admin })).body.roles.find((r: { code: string }) => r.code === 'usuario_mgcred').id;
    const u = await call('/users', { method: 'POST', session: admin, body: { name: 'Convidado', email: 'new@example.test', roleId } });
    expect(u.status, JSON.stringify(u.body)).toBe(201);
    const secret = u.body.activationUrl.split('#ativar=')[1];
    expect(secret).toBeTruthy();
    expect((await call('/activate', { method: 'POST', body: { token: secret, password: pw } })).status).toBe(200);
    expect((await call('/activate', { method: 'POST', body: { token: secret, password: pw } })).status).toBe(400);
    const session = await login('NEW@example.test', pw);
    await call('/users/' + u.body.user.id, { method: 'PATCH', session: admin, body: { active: false } });
    expect((await call('/state', { session })).status).toBe(401);
  });

  test('perfis são configuráveis por permissões', async () => {
    const [role] = await database.db.insert(roles).values({ code: 'diretoria', name: 'Diretoria' }).returning();
    await database.db.insert(rolePermissions).values({ roleId: role!.id, permissionCode: 'cases.view_all' });
    const passwordHash = await hashPassword(pw);
    await seedUser(database.db, { email: 'dir@example.test', name: 'Diretoria', role: 'diretoria', passwordHash });
    const dir = await login('dir@example.test', pw);
    const state = (await call('/state', { session: dir })).body;
    expect(state.cases.some((c: { number: string }) => c.number === 'TEST-002')).toBe(true);
    expect(state.user.permissions).toEqual(['cases.view_all']);
    expect((await call('/cases', { method: 'POST', session: dir, body: { number: 'X-1', title: 'x' } })).status).toBe(403);
    expect((await call('/requests', { method: 'POST', session: dir, body: { subject: 'x', description: 'x', categoryId: contratos, priority: 'normal' } })).status).toBe(403);
  });

  test('reinício mantém os dados; logout invalida o cookie', async () => {
    await app.close();
    ({ app, ctx, base } = await startApp(database.url, { webDist: webDir }));
    const detail = await call('/requests/' + requestId, { session: alice });
    expect(detail.status).toBe(200);
    expect(detail.body.messages).toHaveLength(1);
    expect(detail.body.files).toHaveLength(1);
    expect((await call('/logout', { method: 'POST', session: alice, body: {} })).status).toBe(200);
    expect((await call('/me', { session: alice })).status).toBe(401);
  });

  test('expiração por inatividade e absoluta é aplicada pelo servidor', async () => {
    const s = await login(bobRow.email, pw);
    await database.db.update(sessions).set({ lastSeenAt: new Date(Date.now() - 31 * 60_000) }).where(eq(sessions.tokenHash, digest(s.cookie.split('=')[1]!)));
    expect((await call('/me', { session: s })).status).toBe(401);
    const s2 = await login(bobRow.email, pw);
    await database.db.update(sessions).set({ expiresAt: new Date(Date.now() - 1) }).where(eq(sessions.tokenHash, digest(s2.cookie.split('=')[1]!)));
    expect((await call('/me', { session: s2 })).status).toBe(401);
  });

  test('limite por conta bloqueia tentativas repetidas de login', async () => {
    for (let i = 0; i < 10; i++) expect((await call('/login', { method: 'POST', body: { email: 'unknown@example.test', password: 'invalid' } })).status).toBe(401);
    expect((await call('/login', { method: 'POST', body: { email: 'unknown@example.test', password: 'invalid' } })).status).toBe(429);
  });

  test('IP do cliente vem do cabeçalho configurado (CF-Connecting-IP no Render)', () => {
    const req = { headers: { 'cf-connecting-ip': '203.0.113.9', 'x-forwarded-for': '198.51.100.1, 104.22.17.40' }, socket: { remoteAddress: '10.0.0.1' } } as never;
    expect(clientIp({ ...ctx, config: { ...ctx.config, clientIpHeader: 'cf-connecting-ip' } }, req)).toBe('203.0.113.9');
    expect(clientIp({ ...ctx, config: { ...ctx.config, clientIpHeader: null } }, req)).toBe('10.0.0.1');
  });

  test('produção exige origem HTTPS e emite cookie seguro', async () => {
    await expect(startApp(database.url, { production: true })).rejects.toThrow(/HTTPS/);
    const prod = await startApp(database.url, { production: true, origin: 'https://portal.example.test' });
    try {
      const res = await fetch(prod.base + '/api/login', { method: 'POST', headers: { origin: 'https://portal.example.test', 'content-type': 'application/json' }, body: JSON.stringify({ email: adminRow.email, password: pw }) });
      expect(res.status).toBe(200);
      const cookie = res.headers.get('set-cookie')!;
      expect(cookie).toMatch(/^__Host-mgcred=/);
      expect(cookie).toMatch(/HttpOnly/);
      expect(cookie).toMatch(/SameSite=Strict/);
      expect(cookie).toMatch(/; Secure/);
      expect(res.headers.get('strict-transport-security')).toBe('max-age=31536000');
    } finally {
      await prod.app.close();
    }
  });

  test('anexos perto de 5 MB funcionam; acima do limite são recusados sem erro de servidor', async () => {
    const near = Buffer.alloc(5 * 1024 * 1024 - 16, 65);
    const ok = await upload(requestId, 'grande.txt', near, admin);
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    const file = await call('/documents/' + ok.body.id, { session: admin });
    expect(file.body.length).toBe(near.length);
    expect((await upload(requestId, 'excesso.txt', Buffer.alloc(5 * 1024 * 1024 + 16, 65), admin)).status).toBe(400);
    expect((await upload(requestId, 'vazio.txt', Buffer.alloc(0), admin)).status).toBe(400);
  });

  test('setor novo pode ser cadastrado pelo administrador', async () => {
    const client = await login(bobRow.email, pw);
    expect((await call('/departments', { method: 'POST', session: client, body: { name: 'Diretoria' } })).status).toBe(403);
    const r = await call('/departments', { method: 'POST', session: admin, body: { name: 'Diretoria' } });
    expect(r.status).toBe(201);
    expect((await call('/departments', { method: 'POST', session: admin, body: { name: 'diretoria' } })).status).toBe(409);
    expect(await database.db.select().from(departments).where(eq(departments.name, 'Diretoria'))).toHaveLength(1);
  });
});
