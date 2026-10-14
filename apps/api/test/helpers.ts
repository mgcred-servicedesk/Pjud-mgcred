import pg from 'pg';
import { randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { buildApp } from '../src/app.ts';
import type { Config } from '../src/config.ts';
import { createDb, runMigrations } from '../src/db/client.ts';
import { departments, roles, users } from '../src/db/schema.ts';

// Servidor PostgreSQL de testes (um banco descartável por arquivo de teste).
export const adminUrl = process.env.TEST_DATABASE_URL ?? 'postgres://postgres:dev@127.0.0.1:5433/postgres';
export const origin = 'http://127.0.0.1:4320';

const withDatabase = (url: string, name: string) => { const u = new URL(url); u.pathname = '/' + name; return u.toString(); };

export async function createTestDatabase() {
  const name = 'mgcred_test_' + randomBytes(6).toString('hex');
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();
  const url = withDatabase(adminUrl, name);
  const { db, pool } = createDb(url);
  await runMigrations(db);
  return {
    url, db,
    async drop() {
      await pool.end();
      const c = new pg.Client({ connectionString: adminUrl });
      await c.connect();
      await c.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await c.end();
    },
  };
}

export async function startApp(databaseUrl: string, overrides: Partial<Config> = {}) {
  const { app, ctx } = await buildApp({ databaseUrl, origin, production: false, webDist: null, clientIpHeader: null, ...overrides });
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address();
  const base = 'http://127.0.0.1:' + (typeof address === 'object' && address ? address.port : 0);
  return { app, ctx, base };
}

export async function seedUser(db: ReturnType<typeof createDb>['db'], data: { email: string; name: string; role: string; department?: string; passwordHash: string }) {
  const [role] = await db.select({ id: roles.id }).from(roles).where(eq(roles.code, data.role));
  let departmentId: string | null = null;
  if (data.department) {
    const [found] = await db.select({ id: departments.id }).from(departments).where(eq(departments.name, data.department));
    departmentId = found?.id ?? (await db.insert(departments).values({ name: data.department }).returning({ id: departments.id }))[0]!.id;
  }
  const [u] = await db.insert(users).values({ email: data.email, name: data.name, roleId: role!.id, departmentId, passwordHash: data.passwordHash }).returning();
  return u!;
}

export interface Session { cookie: string; csrf: string }

export function client(getBase: () => string) {
  async function call(path: string, opts: { method?: string; body?: unknown; form?: FormData; session?: Session; headers?: Record<string, string> } = {}) {
    const method = opts.method ?? 'GET';
    const headers: Record<string, string> = {
      ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(method !== 'GET' ? { origin } : {}),
      ...(opts.session ? { cookie: opts.session.cookie, 'x-csrf-token': opts.session.csrf } : {}),
      ...opts.headers,
    };
    const res = await fetch(getBase() + '/api' + path, { method, headers, body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined) });
    const type = res.headers.get('content-type') ?? '';
    const body = type.includes('application/json') ? await res.json() : await res.text();
    return { status: res.status, body: body as any, headers: res.headers };
  }
  async function login(email: string, password: string): Promise<Session> {
    const r = await call('/login', { method: 'POST', body: { email, password } });
    if (r.status !== 200) throw new Error(`login ${email}: ${r.status} ${JSON.stringify(r.body)}`);
    return { cookie: r.headers.get('set-cookie')!.split(';')[0]!, csrf: r.body.csrf };
  }
  const upload = (requestId: string, name: string, content: Buffer | string, session: Session) => {
    const form = new FormData();
    form.append('file', new Blob([Uint8Array.from(Buffer.from(content))]), name);
    return call(`/requests/${requestId}/files`, { method: 'POST', form, session });
  };
  return { call, login, upload };
}
