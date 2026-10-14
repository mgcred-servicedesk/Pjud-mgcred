import type { Executor } from '../db/client.ts';
import { auditLog } from '../db/schema.ts';

export async function audit(exec: Executor, actorId: string | null, action: string, entityType: string, entityId: string | null, details: Record<string, unknown> = {}) {
  await exec.insert(auditLog).values({ actorId, action, entityType, entityId, details });
}
