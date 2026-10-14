import { createDb, runMigrations } from './client.ts';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL não configurada.');
const { db, pool } = createDb(url);
try {
  await runMigrations(db);
  console.log('Migrações aplicadas.');
} finally {
  await pool.end();
}
