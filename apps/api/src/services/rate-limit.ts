import { sql } from 'drizzle-orm';
import type { Db } from '../db/client.ts';
import { fail } from '../lib/errors.ts';

export async function rate(db: Db, key: string, limit: number, windowMs = 15 * 60_000) {
  const { rows } = await db.execute<{ count: number }>(sql`
    INSERT INTO rate_limits (key, count, expires_at) VALUES (${key}, 1, now() + ${`${windowMs} milliseconds`}::interval)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limits.expires_at < now() THEN 1 ELSE rate_limits.count + 1 END,
      expires_at = CASE WHEN rate_limits.expires_at < now() THEN excluded.expires_at ELSE rate_limits.expires_at END
    RETURNING count`);
  if ((rows[0]?.count ?? 0) > limit) fail(429, 'Muitas tentativas. Aguarde 15 minutos.');
}

export async function purgeExpiredRates(db: Db) {
  await db.execute(sql`DELETE FROM rate_limits WHERE expires_at < now()`);
}
