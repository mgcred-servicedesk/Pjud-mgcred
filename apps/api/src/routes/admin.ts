import type { FastifyInstance } from 'fastify';
import { and, asc, eq, isNull, lt, sql } from 'drizzle-orm';
import type { Permission, Role, UserSummary } from '@mgcred/shared';
import { auditLog, departments, invitations, rolePermissions, roles, sessions, users } from '../db/schema.ts';
import type { Executor } from '../db/client.ts';
import { fail } from '../lib/errors.ts';
import { digest, token } from '../lib/crypto.ts';
import { body, bool, email, isUuid, optionalUuid, text, uuid } from '../lib/validate.ts';
import { actorFromRow, actorQuery, requirePermission, toMe } from '../services/actor.ts';
import { audit } from '../services/audit.ts';
import { auditEvents } from '../services/queries.ts';
import { currentActor, type AppContext } from '../context.ts';

const INVITE_MS = 24 * 3600_000;

export async function issueInvitation(exec: Executor, origin: string, userId: string, actorId: string | null) {
  const secret = token();
  await exec.update(invitations).set({ usedAt: sql`now()` }).where(and(eq(invitations.userId, userId), isNull(invitations.usedAt)));
  await exec.insert(invitations).values({ tokenHash: digest(secret), userId, createdBy: actorId, expiresAt: new Date(Date.now() + INVITE_MS) });
  await audit(exec, actorId, 'convite.emitido', 'user', userId);
  return `${origin}/#ativar=${secret}`;
}

export async function adminRoutes(app: FastifyInstance, { db, config }: AppContext) {
  async function targetUser(id: string) {
    if (!isUuid(id)) fail(404, 'Usuário não encontrado.');
    const [row] = await db.select({ id: users.id, active: users.active }).from(users).where(eq(users.id, id));
    if (!row) fail(404, 'Usuário não encontrado.');
    return row;
  }

  app.get('/users', async (req): Promise<{ users: UserSummary[] }> => {
    requirePermission(currentActor(req), 'users.manage');
    const rows = await actorQuery(db).orderBy(asc(users.name));
    return { users: rows.map(r => ({ ...toMe(actorFromRow(r)), createdAt: (r.createdAt as Date).toISOString() })) };
  });

  app.post('/users', async (req, reply) => {
    const actor = currentActor(req);
    requirePermission(actor, 'users.manage');
    const b = body(req.body);
    const data = { email: email(b.email), name: text(b.name, 'Nome', 100), departmentId: optionalUuid(b.departmentId, 'Setor'), roleId: uuid(b.roleId, 'Perfil') };
    if ((await db.select({ id: users.id }).from(users).where(eq(sql`lower(${users.email})`, data.email))).length) fail(409, 'E-mail já cadastrado.');
    const result = await db.transaction(async tx => {
      const [u] = await tx.insert(users).values(data).returning({ id: users.id });
      await audit(tx, actor.id, 'usuário.criado', 'user', u!.id);
      return { id: u!.id, activationUrl: await issueInvitation(tx, config.origin, u!.id, actor.id) };
    });
    return reply.status(201).send({ user: { id: result.id }, activationUrl: result.activationUrl });
  });

  app.post('/users/:id/invite', async req => {
    const actor = currentActor(req);
    requirePermission(actor, 'users.manage');
    const target = await targetUser((req.params as { id: string }).id);
    if (!target.active) fail(400, 'Usuário desativado.');
    return { activationUrl: await db.transaction(tx => issueInvitation(tx, config.origin, target.id, actor.id)) };
  });

  app.patch('/users/:id', async req => {
    const actor = currentActor(req);
    requirePermission(actor, 'users.manage');
    const target = await targetUser((req.params as { id: string }).id);
    const active = bool(body(req.body).active, 'Situação');
    if (target.id === actor.id) fail(400, 'Não é possível desativar sua própria conta.');
    await db.transaction(async tx => {
      await tx.update(users).set({ active, updatedAt: sql`now()`, version: sql`${users.version} + 1` }).where(eq(users.id, target.id));
      await tx.delete(sessions).where(eq(sessions.userId, target.id));
      await tx.update(invitations).set({ usedAt: sql`now()` }).where(and(eq(invitations.userId, target.id), isNull(invitations.usedAt)));
      await audit(tx, actor.id, active ? 'usuário.ativado' : 'usuário.desativado', 'user', target.id);
    });
    return { ok: true };
  });

  app.get('/roles', async (req): Promise<{ roles: Role[] }> => {
    requirePermission(currentActor(req), 'users.manage');
    const rows = await db.select({
      id: roles.id, code: roles.code, name: roles.name,
      permissions: sql<Permission[]>`coalesce(array_agg(${rolePermissions.permissionCode} ORDER BY ${rolePermissions.permissionCode}) FILTER (WHERE ${rolePermissions.permissionCode} IS NOT NULL), '{}')`,
    }).from(roles).leftJoin(rolePermissions, eq(rolePermissions.roleId, roles.id)).groupBy(roles.id).orderBy(asc(roles.name));
    return { roles: rows };
  });

  app.get('/departments', async () => ({
    departments: await db.select({ id: departments.id, name: departments.name, active: departments.active }).from(departments).orderBy(asc(departments.name)),
  }));

  app.post('/departments', async (req, reply) => {
    const actor = currentActor(req);
    requirePermission(actor, 'users.manage');
    const name = text(body(req.body).name, 'Setor', 80);
    if ((await db.select({ id: departments.id }).from(departments).where(eq(sql`lower(${departments.name})`, name.toLowerCase()))).length) fail(409, 'Setor já cadastrado.');
    const id = await db.transaction(async tx => {
      const [d] = await tx.insert(departments).values({ name }).returning({ id: departments.id });
      await audit(tx, actor.id, 'setor.criado', 'department', d!.id, { name });
      return d!.id;
    });
    return reply.status(201).send({ id });
  });

  app.get('/audit', async req => {
    requirePermission(currentActor(req), 'audit.view');
    const before = Math.max(0, Number((req.query as { before?: string }).before) || 0);
    const events = await auditEvents(db, before ? lt(auditLog.id, before) : undefined, 100);
    return { events, next: events.length === 100 ? events.at(-1)!.id : null };
  });
}
