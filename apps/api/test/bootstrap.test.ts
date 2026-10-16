import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { eq } from 'drizzle-orm';
import { auditLog, users } from '../src/db/schema.ts';
import { bootstrapAdmin } from '../src/services/bootstrap.ts';
import { client, createTestDatabase, startApp } from './helpers.ts';

const pw = 'Frase inicial descartavel 2026!';
let database: Awaited<ReturnType<typeof createTestDatabase>>;

beforeAll(async () => { database = await createTestDatabase(); });
afterAll(async () => { await database?.drop(); });

describe('Administrador inicial por variáveis de ambiente', () => {
  test('sem senha nada é criado; senha sem e-mail ou curta é recusada', async () => {
    expect(await bootstrapAdmin(database.db, { email: 'adm@example.test' })).toBe('skipped');
    await expect(bootstrapAdmin(database.db, { password: pw })).rejects.toThrow(/BOOTSTRAP_ADMIN_EMAIL/);
    await expect(bootstrapAdmin(database.db, { email: 'adm@example.test', password: 'curta' })).rejects.toThrow(/14 a 128/);
    expect(await database.db.select().from(users)).toHaveLength(0);
  });

  test('cria o administrador ativo, audita, permite login e não repete', async () => {
    expect(await bootstrapAdmin(database.db, { email: 'Adm@Example.test', password: pw })).toBe('created');
    const [u] = await database.db.select().from(users);
    expect(u).toMatchObject({ email: 'adm@example.test', active: true });
    const logs = await database.db.select().from(auditLog).where(eq(auditLog.entityId, u!.id));
    expect(logs.map(l => l.action)).toContain('administrador.inicial.criado');

    expect(await bootstrapAdmin(database.db, { email: 'outro@example.test', password: pw + 'x' })).toBe('skipped');
    expect(await database.db.select().from(users)).toHaveLength(1);

    const { app, base } = await startApp(database.url);
    try {
      const me = await client(() => base).login('adm@example.test', pw);
      expect(me.csrf).toBeTruthy();
    } finally {
      await app.close();
    }
  });
});
