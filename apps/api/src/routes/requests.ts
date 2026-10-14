import type { FastifyInstance, FastifyRequest } from 'fastify';
import { and, asc, count, eq, sql, sum } from 'drizzle-orm';
import { priorities, requestStatuses, upload, type RequestDetail } from '@mgcred/shared';
import { documents, requestAccess, requestCategories, requestMessages, requests, requestSequences, users, rolePermissions } from '../db/schema.ts';
import type { Executor } from '../db/client.ts';
import { fail } from '../lib/errors.ts';
import { digest } from '../lib/crypto.ts';
import { contentDisposition, validateFileContent, validateFileName } from '../lib/files.ts';
import { body, bool, choice, isUuid, optionalUuid, text, uuid, version } from '../lib/validate.ts';
import { activeActor, can, requirePermission, type Actor } from '../services/actor.ts';
import { audit } from '../services/audit.ts';
import { rate } from '../services/rate-limit.ts';
import { auditEvents, listRequests, requestHistoryFilter } from '../services/queries.ts';
import { canSeeRequest } from '../services/visibility.ts';
import { currentActor, type AppContext } from '../context.ts';

const PREFIX = 'JUR';
const yearInSaoPaulo = () => Number(new Intl.DateTimeFormat('en', { timeZone: 'America/Sao_Paulo', year: 'numeric' }).format(new Date()));

export async function visibleRequest(exec: Executor, actor: Actor, id: string) {
  if (!isUuid(id)) fail(404, 'Solicitação não encontrada.');
  const [r] = await exec.select().from(requests).where(and(eq(requests.id, id), canSeeRequest(actor, requests.id)));
  if (!r) fail(404, 'Solicitação não encontrada.');
  return r;
}

const idParam = (req: FastifyRequest) => (req.params as { id: string }).id;

export async function requestRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db, storage, config } = ctx;

  app.post('/requests', async (req, reply) => {
    const actor = currentActor(req);
    requirePermission(actor, 'requests.create');
    const b = body(req.body);
    const subject = text(b.subject, 'Assunto', 140);
    const description = text(b.description, 'Descrição', 5000);
    const categoryId = uuid(b.categoryId, 'Categoria');
    const priority = choice(b.priority, priorities, 'Prioridade');
    const departmentId = can(actor, 'requests.set_department') ? optionalUuid(b.departmentId, 'Setor') ?? actor.departmentId : actor.departmentId;
    const [category] = await db.select({ id: requestCategories.id }).from(requestCategories).where(and(eq(requestCategories.id, categoryId), eq(requestCategories.active, true)));
    if (!category) fail(400, 'Categoria: opção inválida.');
    const created = await db.transaction(async tx => {
      const year = yearInSaoPaulo();
      const [seq] = await tx.insert(requestSequences).values({ prefix: PREFIX, year, lastValue: 1 })
        .onConflictDoUpdate({ target: [requestSequences.prefix, requestSequences.year], set: { lastValue: sql`${requestSequences.lastValue} + 1` } })
        .returning({ value: requestSequences.lastValue });
      const code = `${PREFIX}-${year}-${String(seq!.value).padStart(3, '0')}`;
      const [ownerRow] = await tx.select({ id: users.id }).from(users)
        .innerJoin(rolePermissions, and(eq(rolePermissions.roleId, users.roleId), eq(rolePermissions.permissionCode, 'requests.manage')))
        .where(eq(users.active, true)).orderBy(asc(users.createdAt)).limit(1);
      const [r] = await tx.insert(requests).values({ code, subject, description, categoryId, priority, requesterId: actor.id, ownerId: ownerRow?.id ?? null, departmentId })
        .returning({ id: requests.id, code: requests.code });
      await audit(tx, actor.id, 'solicitação.criada', 'request', r!.id, { code });
      return r!;
    });
    return reply.status(201).send(created);
  });

  app.get('/requests/:id', async (req): Promise<RequestDetail> => {
    const actor = currentActor(req);
    const r = await visibleRequest(db, actor, idParam(req));
    const [item] = await listRequests(db, actor, eq(requests.id, r.id), 1);
    const internal = can(actor, 'messages.internal');
    const [messages, history, access] = await Promise.all([
      db.select({ id: requestMessages.id, body: requestMessages.body, isInternal: requestMessages.isInternal, author: users.name, createdAt: requestMessages.createdAt })
        .from(requestMessages).innerJoin(users, eq(users.id, requestMessages.authorId))
        .where(and(eq(requestMessages.requestId, r.id), internal ? undefined : eq(requestMessages.isInternal, false)))
        .orderBy(asc(requestMessages.createdAt)),
      auditEvents(db, requestHistoryFilter(actor, r.id), 500),
      can(actor, 'requests.share')
        ? db.select({ id: users.id, name: users.name, email: users.email }).from(requestAccess).innerJoin(users, eq(users.id, requestAccess.userId)).where(eq(requestAccess.requestId, r.id)).orderBy(asc(users.name))
        : Promise.resolve([]),
    ]);
    return { ...item!, messages: messages.map(m => ({ ...m, createdAt: m.createdAt.toISOString() })), history, access };
  });

  app.patch('/requests/:id', async req => {
    const actor = currentActor(req);
    requirePermission(actor, 'requests.manage');
    const r = await visibleRequest(db, actor, idParam(req));
    const b = body(req.body);
    const v = version(b.version);
    const status = choice(b.status ?? r.status, requestStatuses, 'Status');
    const priority = choice(b.priority ?? r.priority, priorities, 'Prioridade');
    let ownerId = r.ownerId;
    if (Object.hasOwn(b, 'ownerId')) {
      ownerId = optionalUuid(b.ownerId, 'Responsável');
      if (ownerId && !can(await activeActor(db, ownerId), 'requests.manage')) fail(400, 'Responsável deve ter perfil de gestão de solicitações.');
    }
    await db.transaction(async tx => {
      const [updated] = await tx.update(requests).set({ status, priority, ownerId, updatedAt: sql`now()`, version: sql`${requests.version} + 1` })
        .where(and(eq(requests.id, r.id), eq(requests.version, v))).returning({ id: requests.id });
      if (!updated) fail(409, 'Este registro foi alterado. Atualize a página e tente novamente.');
      await audit(tx, actor.id, 'solicitação.atualizada', 'request', r.id, { status, priority, ownerId });
    });
    return { ok: true };
  });

  app.post('/requests/:id/messages', async (req, reply) => {
    const actor = currentActor(req);
    const r = await visibleRequest(db, actor, idParam(req));
    const b = body(req.body);
    const text_ = text(b.body, 'Mensagem', 5000);
    const isInternal = b.isInternal === undefined ? false : bool(b.isInternal, 'Mensagem interna');
    if (isInternal) requirePermission(actor, 'messages.internal');
    await db.transaction(async tx => {
      await tx.insert(requestMessages).values({ requestId: r.id, authorId: actor.id, body: text_, isInternal });
      await tx.update(requests).set({ updatedAt: sql`now()` }).where(eq(requests.id, r.id));
      await audit(tx, actor.id, isInternal ? 'mensagem.interna' : 'mensagem.registrada', 'request', r.id, isInternal ? { internal: true } : {});
    });
    return reply.status(201).send({ ok: true });
  });

  app.post('/requests/:id/access', async req => {
    const actor = currentActor(req);
    requirePermission(actor, 'requests.share');
    const r = await visibleRequest(db, actor, idParam(req));
    const b = body(req.body);
    const target = await activeActor(db, uuid(b.userId, 'Usuário'));
    const allow = bool(b.allow, 'Permissão');
    await db.transaction(async tx => {
      if (allow) await tx.insert(requestAccess).values({ requestId: r.id, userId: target.id, grantedBy: actor.id }).onConflictDoNothing();
      else await tx.delete(requestAccess).where(and(eq(requestAccess.requestId, r.id), eq(requestAccess.userId, target.id)));
      await audit(tx, actor.id, allow ? 'acesso.concedido' : 'acesso.removido', 'request', r.id, { userId: target.id, user: target.name });
    });
    return { ok: true };
  });

  app.post('/requests/:id/files', async (req, reply) => {
    const actor = currentActor(req);
    await rate(db, 'upload:' + actor.id, 40);
    const r = await visibleRequest(db, actor, idParam(req));
    const file = await req.file();
    if (!file) fail(400, 'Selecione um arquivo.');
    const { name, extension, mimeType } = validateFileName(file.filename);
    const bytes = await file.toBuffer();
    validateFileContent(extension, bytes);
    const created = await db.transaction(async tx => {
      await visibleRequest(tx, actor, r.id);
      const [{ n } = { n: 0 }] = await tx.select({ n: count() }).from(documents).where(eq(documents.requestId, r.id));
      if (n >= upload.maxPerRequest) fail(400, `Limite de ${upload.maxPerRequest} anexos por solicitação.`);
      const [{ total } = { total: '0' }] = await tx.select({ total: sum(documents.sizeBytes) }).from(documents);
      if (Number(total ?? 0) + bytes.length > config.maxStorageBytes) fail(507, 'Limite de armazenamento atingido. Contate o administrador.');
      const [doc] = await tx.insert(documents).values({ requestId: r.id, fileName: name, mimeType, sizeBytes: bytes.length, sha256: digest(bytes), storageKey: crypto.randomUUID(), uploadedBy: actor.id })
        .returning({ id: documents.id, storageKey: documents.storageKey });
      await storage.put(tx, doc!.storageKey, bytes);
      await audit(tx, actor.id, 'documento.anexado', 'request', r.id, { documentId: doc!.id, name });
      return doc!;
    });
    return reply.status(201).send({ id: created.id });
  });

  app.get('/documents/:id', async (req, reply) => {
    const actor = currentActor(req);
    const id = idParam(req);
    if (!isUuid(id)) fail(404, 'Documento não encontrado.');
    const [doc] = await db.select().from(documents).where(and(eq(documents.id, id), canSeeRequest(actor, documents.requestId)));
    if (!doc) fail(404, 'Documento não encontrado.');
    const bytes = await storage.get(db, doc.storageKey);
    if (!bytes || digest(bytes) !== doc.sha256) fail(500, 'Integridade do documento não confirmada.');
    await audit(db, actor.id, 'documento.baixado', 'request', doc.requestId, { documentId: doc.id });
    return reply.header('Content-Type', doc.mimeType).header('Content-Disposition', contentDisposition(doc.fileName)).header('Content-Length', bytes.length).send(bytes);
  });
}
