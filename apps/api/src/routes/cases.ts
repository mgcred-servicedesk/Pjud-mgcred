import type { FastifyInstance, FastifyRequest } from 'fastify';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { importColumns, type CaseAccessEntry, type ImportPreview } from '@mgcred/shared';
import { caseAccess, cases, departments, importBatches, users } from '../db/schema.ts';
import type { Executor } from '../db/client.ts';
import { fail } from '../lib/errors.ts';
import { digest } from '../lib/crypto.ts';
import { normalizeCase, parseCSV, type CaseInput } from '../lib/csv.ts';
import { body, bool, isUuid, optionalUuid, version } from '../lib/validate.ts';
import { activeActor, requirePermission, type Actor } from '../services/actor.ts';
import { audit } from '../services/audit.ts';
import { canSeeCase } from '../services/visibility.ts';
import { currentActor, type AppContext } from '../context.ts';

export async function visibleCase(exec: Executor, actor: Actor, id: string) {
  if (!isUuid(id)) fail(404, 'Processo não encontrado.');
  const [c] = await exec.select().from(cases).where(and(eq(cases.id, id), canSeeCase(actor, cases.id)));
  if (!c) fail(404, 'Processo não encontrado.');
  return c;
}

const idParam = (req: FastifyRequest) => (req.params as { id: string }).id;

async function insertCase(exec: Executor, actor: Actor, c: CaseInput) {
  const [row] = await exec.insert(cases).values(c).returning({ id: cases.id });
  await audit(exec, actor.id, 'processo.salvo', 'case', row!.id, { number: c.number, clientVisible: c.clientVisible });
  return row!.id;
}

async function existingNumbers(exec: Executor, numbers: string[]) {
  if (!numbers.length) return [];
  return (await exec.select({ number: cases.number }).from(cases).where(inArray(cases.number, numbers))).map(r => r.number);
}

export async function caseRoutes(app: FastifyInstance, { db }: AppContext) {
  app.post('/cases', async (req, reply) => {
    const actor = currentActor(req);
    requirePermission(actor, 'cases.manage');
    const c = normalizeCase(body(req.body));
    if ((await existingNumbers(db, [c.number])).length) fail(409, 'Processo já cadastrado.');
    const id = await db.transaction(tx => insertCase(tx, actor, c));
    return reply.status(201).send({ id });
  });

  app.patch('/cases/:id', async req => {
    const actor = currentActor(req);
    requirePermission(actor, 'cases.manage');
    const old = await visibleCase(db, actor, idParam(req));
    const b = body(req.body);
    const v = version(b.version);
    const c = normalizeCase(b);
    await db.transaction(async tx => {
      const [updated] = await tx.update(cases).set({ ...c, updatedAt: sql`now()`, version: sql`${cases.version} + 1` })
        .where(and(eq(cases.id, old.id), eq(cases.version, v))).returning({ id: cases.id });
      if (!updated) fail(409, 'Este registro foi alterado. Atualize a página e tente novamente.');
      await audit(tx, actor.id, 'processo.salvo', 'case', old.id, { number: c.number, clientVisible: c.clientVisible });
    });
    return { id: old.id };
  });

  app.get('/cases/:id/access', async (req): Promise<{ access: CaseAccessEntry[] }> => {
    const actor = currentActor(req);
    requirePermission(actor, 'cases.manage');
    const c = await visibleCase(db, actor, idParam(req));
    const rows = await db.select({ id: caseAccess.id, userId: users.id, userName: users.name, userEmail: users.email, departmentId: departments.id, departmentName: departments.name })
      .from(caseAccess).leftJoin(users, eq(users.id, caseAccess.userId)).leftJoin(departments, eq(departments.id, caseAccess.departmentId))
      .where(eq(caseAccess.caseId, c.id)).orderBy(asc(departments.name), asc(users.name));
    return {
      access: rows.map(r => ({
        id: r.id,
        user: r.userId ? { id: r.userId, name: r.userName ?? '', email: r.userEmail ?? '' } : null,
        department: r.departmentId ? { id: r.departmentId, name: r.departmentName ?? '' } : null,
      })),
    };
  });

  app.post('/cases/:id/access', async req => {
    const actor = currentActor(req);
    requirePermission(actor, 'cases.manage');
    const c = await visibleCase(db, actor, idParam(req));
    const b = body(req.body);
    const allow = bool(b.allow, 'Permissão');
    const userId = optionalUuid(b.userId, 'Usuário');
    const departmentId = optionalUuid(b.departmentId, 'Setor');
    if ((userId ? 1 : 0) + (departmentId ? 1 : 0) !== 1) fail(400, 'Informe um usuário ou um setor.');
    if (userId) await activeActor(db, userId);
    if (departmentId && !(await db.select({ id: departments.id }).from(departments).where(and(eq(departments.id, departmentId), eq(departments.active, true)))).length)
      fail(400, 'Setor indisponível.');
    const target = and(eq(caseAccess.caseId, c.id), userId ? eq(caseAccess.userId, userId) : isNull(caseAccess.userId), departmentId ? eq(caseAccess.departmentId, departmentId) : isNull(caseAccess.departmentId));
    await db.transaction(async tx => {
      if (allow) {
        if (!(await tx.select({ id: caseAccess.id }).from(caseAccess).where(target)).length)
          await tx.insert(caseAccess).values({ caseId: c.id, userId, departmentId, grantedBy: actor.id });
      } else await tx.delete(caseAccess).where(target);
      await audit(tx, actor.id, allow ? 'acesso.concedido' : 'acesso.removido', 'case', c.id, userId ? { userId } : { departmentId });
    });
    return { ok: true };
  });

  app.post('/import/preview', { bodyLimit: 2 * 1024 * 1024 }, async (req): Promise<ImportPreview> => {
    const actor = currentActor(req);
    requirePermission(actor, 'cases.import');
    const b = body(req.body);
    const parsed = parseCSV(b.csv);
    for (const number of await existingNumbers(db, parsed.items.map(i => i.number)))
      parsed.errors.push({ line: null, message: `Processo ${number} já cadastrado. Nenhuma linha será importada.` });
    return { items: parsed.items.map(i => ({ number: i.number, title: i.title, claimValue: i.claimValue })), errors: parsed.errors, total: parsed.total, hash: digest(b.csv as string) };
  });

  app.post('/import/confirm', { bodyLimit: 2 * 1024 * 1024 }, async (req, reply) => {
    const actor = currentActor(req);
    requirePermission(actor, 'cases.import');
    const b = body(req.body);
    if (typeof b.csv !== 'string' || digest(b.csv) !== b.hash) fail(400, 'Arquivo alterado. Valide novamente.');
    const p = parseCSV(b.csv);
    if (p.errors.length) fail(400, 'Corrija as linhas inválidas antes de importar.');
    const id = await db.transaction(async tx => {
      const duplicated = await existingNumbers(tx, p.items.map(i => i.number));
      if (duplicated.length) fail(409, `Processo ${duplicated[0]} já cadastrado. Importação cancelada.`);
      for (const c of p.items) await insertCase(tx, actor, c);
      const [batch] = await tx.insert(importBatches).values({ fileSha256: b.hash as string, rowCount: p.items.length, createdBy: actor.id }).returning({ id: importBatches.id });
      await audit(tx, actor.id, 'importação.concluída', 'import', batch!.id, { count: p.items.length });
      return batch!.id;
    });
    return reply.status(201).send({ id, count: p.items.length });
  });

  app.get('/import/template', async (req, reply) => {
    requirePermission(currentActor(req), 'cases.import');
    return reply.header('Content-Type', 'text/csv; charset=utf-8').header('Content-Disposition', 'attachment; filename="modelo-processos.csv"')
      .send('\uFEFF' + importColumns.join(';') + '\r\n');
  });
}
