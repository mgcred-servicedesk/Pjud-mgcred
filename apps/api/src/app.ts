import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { and, eq, gt, sql } from 'drizzle-orm';
import { upload } from '@mgcred/shared';
import { loadConfig, type Config } from './config.ts';
import { createDb } from './db/client.ts';
import { sessions } from './db/schema.ts';
import { HttpError } from './lib/errors.ts';
import { digest } from './lib/crypto.ts';
import { loadActor } from './services/actor.ts';
import { postgresStorage } from './services/storage.ts';
import { rate } from './services/rate-limit.ts';
import { readSessionCookie, type AppContext } from './context.ts';
import { publicAuthRoutes, sessionRoutes } from './routes/auth.ts';
import { stateRoutes } from './routes/state.ts';
import { requestRoutes } from './routes/requests.ts';
import { caseRoutes } from './routes/cases.ts';
import { taskRoutes } from './routes/tasks.ts';
import { adminRoutes } from './routes/admin.ts';

const IDLE_MS = 30 * 60_000;

const fastifyMessages: Record<string, [number, string]> = {
  FST_ERR_CTP_INVALID_MEDIA_TYPE: [415, 'Envie JSON.'],
  FST_ERR_CTP_BODY_TOO_LARGE: [413, 'Envio acima do limite.'],
  FST_ERR_CTP_EMPTY_JSON_BODY: [400, 'JSON inválido.'],
  FST_ERR_CTP_INVALID_JSON_BODY: [400, 'JSON inválido.'],
  FST_REQ_FILE_TOO_LARGE: [400, 'Arquivo vazio ou maior que 5 MB.'],
  FST_INVALID_MULTIPART_CONTENT_TYPE: [400, 'Envie o arquivo como multipart/form-data.'],
  FST_FILES_LIMIT: [400, 'Envie um arquivo por vez.'],
  FST_PARTS_LIMIT: [400, 'Envie um arquivo por vez.'],
};

const pgMessages: Record<string, [number, string]> = {
  '23505': [409, 'Registro duplicado ou operação conflitante.'],
  '23503': [400, 'Registro relacionado inválido.'],
  '23514': [400, 'Dados inválidos.'],
  '22P02': [400, 'Dados inválidos.'],
};

export async function buildApp(overrides: Partial<Config> = {}) {
  const config = loadConfig(overrides);
  const { db, pool } = createDb(config.databaseUrl);
  const ctx: AppContext = { db, config, storage: postgresStorage, cookieName: config.production ? '__Host-mgcred' : 'mgcred_session' };

  const app = Fastify({ logger: false, bodyLimit: 128 * 1024, requestTimeout: 30_000 });
  app.decorateRequest('actor', null);
  app.decorateRequest('session', null);
  await app.register(multipart, { limits: { fileSize: upload.maxBytes, files: 1, fields: 0, parts: 1 } });

  app.addHook('onRequest', async (req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    reply.header('Cache-Control', 'no-store');
    reply.header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    if (config.production) reply.header('Strict-Transport-Security', 'max-age=31536000');
    if (req.url.startsWith('/api/') && !['GET', 'HEAD'].includes(req.method) && req.headers.origin !== config.origin)
      throw new HttpError(403, 'Origem da requisição não autorizada.');
  });

  app.setErrorHandler((error: FastifyError & { cause?: { code?: string } }, req, reply) => {
    if (error instanceof HttpError) return reply.status(error.status).send({ error: error.message });
    const known = fastifyMessages[error.code];
    if (known) return reply.status(known[0]).send({ error: known[1] });
    const pgCode = error.cause?.code ?? error.code;
    const pgKnown = pgCode ? pgMessages[pgCode] : undefined;
    if (pgKnown) return reply.status(pgKnown[0]).send({ error: pgKnown[1] });
    if (error.statusCode && error.statusCode < 500) return reply.status(error.statusCode).send({ error: 'Requisição inválida.' });
    req.log.error(error);
    console.error(JSON.stringify({ level: 'error', code: error.code ?? 'internal', message: error.message }));
    return reply.status(500).send({ error: 'Não foi possível concluir. Contate o administrador.' });
  });

  app.setNotFoundHandler((_req, reply) => reply.status(404).send({ error: 'Recurso não encontrado.' }));

  app.get('/healthz', async () => {
    await db.execute(sql`SELECT 1`);
    return { ok: true };
  });

  await app.register(async api => {
    await publicAuthRoutes(api, ctx);
    await api.register(async protectedApi => {
      protectedApi.addHook('preHandler', async req => {
        const raw = readSessionCookie(ctx, req);
        if (!raw) throw new HttpError(401, 'Entre para acessar o portal.');
        const tokenHash = digest(raw);
        const [s] = await db.update(sessions).set({ lastSeenAt: sql`now()` })
          .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, sql`now()`), gt(sessions.lastSeenAt, sql`now() - ${`${IDLE_MS} milliseconds`}::interval`)))
          .returning({ userId: sessions.userId, csrf: sessions.csrfToken });
        const actor = s ? await loadActor(db, s.userId) : null;
        if (!s || !actor?.active) {
          await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
          throw new HttpError(401, 'Entre para acessar o portal.');
        }
        req.actor = actor;
        req.session = { tokenHash, csrf: s.csrf };
        if (req.method !== 'GET') {
          if (req.headers['x-csrf-token'] !== s.csrf) throw new HttpError(403, 'Sessão desatualizada. Recarregue a página.');
          await rate(db, 'write:' + actor.id, 600);
        }
      });
      await sessionRoutes(protectedApi, ctx);
      await stateRoutes(protectedApi, ctx);
      await requestRoutes(protectedApi, ctx);
      await caseRoutes(protectedApi, ctx);
      await taskRoutes(protectedApi, ctx);
      await adminRoutes(protectedApi, ctx);
    });
  }, { prefix: '/api' });

  if (config.webDist) await app.register(fastifyStatic, { root: config.webDist, wildcard: false });

  app.addHook('onClose', async () => { await pool.end(); });
  return { app: app as FastifyInstance, ctx };
}
