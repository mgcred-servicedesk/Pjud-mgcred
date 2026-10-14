import pg from 'pg';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { fileURLToPath } from 'node:url';
import * as schema from './schema.ts';

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type Executor = Db | Tx;

export const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

export function createDb(url: string) {
  const pool = new pg.Pool({ connectionString: url, max: Number(process.env.DB_POOL_MAX || 10) });
  return { pool, db: drizzle(pool, { schema }) };
}

export async function runMigrations(db: Db) {
  await migrate(db, { migrationsFolder });
}
