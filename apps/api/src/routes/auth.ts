import type { FastifyInstance } from 'fastify';
import { and, eq, gt, isNull, lt, or, sql } from 'drizzle-orm';
import { invitations, sessions, users } from '../db/schema.ts';
import { fail } from '../lib/errors.ts';
import { digest, hashPassword, token, verifyPassword } from '../lib/crypto.ts';
import { body, email, password, text } from '../lib/validate.ts';
import { loadActor, toMe } from '../services/actor.ts';
import { audit } from '../services/audit.ts';
import { rate } from '../services/rate-limit.ts';
import { clientIp, currentActor, sessionCookie, type AppContext } from '../context.ts';

const SESSION_MS = 8 * 3600_000;

export async function publicAuthRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;

  app.post('/login', async (req, reply) => {
    await rate(db, 'auth-ip:' + digest(clientIp(ctx, req)), 40);
    const b = body(req.body);
    const e = email(b.email);
    await rate(db, 'auth-user:' + digest(e), 10);
    const pw = typeof b.password === 'string' && b.password.length <= 128 ? b.password : '';
    const [u] = await db.select({ id: users.id, passwordHash: users.passwordHash }).from(users).where(eq(sql`lower(${users.email})`, e));
    const valid = await verifyPassword(pw, u?.passwordHash);
    const actor = u ? await loadActor(db, u.id) : null;
    const [current] = u ? await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, u.id)) : [];
    if (!valid || !actor?.active || current?.passwordHash !== u?.passwordHash) {
      await audit(db, null, 'login.recusado', 'session', null, { account: digest(e) });
      fail(401, 'E-mail ou senha inválidos.');
    }
    const raw = token(), csrf = token();
    await db.transaction(async tx => {
      await tx.delete(sessions).where(or(lt(sessions.expiresAt, sql`now()`), lt(sessions.lastSeenAt, sql`now() - interval '30 minutes'`)));
      await tx.insert(sessions).values({ tokenHash: digest(raw), userId: actor.id, csrfToken: csrf, expiresAt: new Date(Date.now() + SESSION_MS), lastSeenAt: new Date() });
      await audit(tx, actor.id, 'login.realizado', 'session', null);
    });
    sessionCookie(ctx, reply, raw, SESSION_MS / 1000);
    return { user: toMe(actor), csrf };
  });

  app.post('/activate', async req => {
    await rate(db, 'activate:' + digest(clientIp(ctx, req)), 20);
    const b = body(req.body);
    const secret = text(b.token, 'Convite', 100);
    password(b.password);
    const tokenHash = digest(secret);
    const valid = and(eq(invitations.tokenHash, tokenHash), isNull(invitations.usedAt), gt(invitations.expiresAt, sql`now()`), eq(users.active, true));
    const [found] = await db.select({ userId: invitations.userId }).from(invitations).innerJoin(users, eq(users.id, invitations.userId)).where(valid);
    if (!found) fail(400, 'Convite inválido ou expirado. Solicite um novo ao administrador.');
    const hashed = await hashPassword(b.password as string);
    await db.transaction(async tx => {
      const [row] = await tx.select({ userId: invitations.userId }).from(invitations).innerJoin(users, eq(users.id, invitations.userId)).where(valid).for('update');
      if (!row) fail(400, 'Convite indisponível.');
      await tx.update(users).set({ passwordHash: hashed, updatedAt: sql`now()` }).where(eq(users.id, row.userId));
      await tx.update(invitations).set({ usedAt: sql`now()` }).where(and(eq(invitations.userId, row.userId), isNull(invitations.usedAt)));
      await tx.delete(sessions).where(eq(sessions.userId, row.userId));
      await audit(tx, row.userId, 'senha.definida', 'user', row.userId);
    });
    return { ok: true };
  });
}

export async function sessionRoutes(app: FastifyInstance, ctx: AppContext) {
  const { db } = ctx;

  app.get('/me', async req => ({ user: toMe(currentActor(req)), csrf: req.session!.csrf }));

  app.post('/logout', async (req, reply) => {
    const actor = currentActor(req);
    await db.delete(sessions).where(eq(sessions.tokenHash, req.session!.tokenHash));
    await audit(db, actor.id, 'logout', 'session', null);
    sessionCookie(ctx, reply, '', 0);
    return { ok: true };
  });

  app.post('/password', async req => {
    const actor = currentActor(req);
    const b = body(req.body);
    await rate(db, 'password:' + actor.id, 5);
    const [u] = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, actor.id));
    if (!await verifyPassword(text(b.current, 'Senha atual', 128), u?.passwordHash)) fail(400, 'Senha atual incorreta.');
    const hash = await hashPassword(password(b.password));
    await db.transaction(async tx => {
      const [now] = await tx.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, actor.id)).for('update');
      if (now?.passwordHash !== u?.passwordHash) fail(409, 'Senha alterada em outra sessão.');
      await tx.update(users).set({ passwordHash: hash, updatedAt: sql`now()` }).where(eq(users.id, actor.id));
      await tx.delete(sessions).where(eq(sessions.userId, actor.id));
      await tx.update(invitations).set({ usedAt: sql`now()` }).where(and(eq(invitations.userId, actor.id), isNull(invitations.usedAt)));
      await audit(tx, actor.id, 'senha.alterada', 'user', actor.id);
    });
    return { ok: true };
  });
}
