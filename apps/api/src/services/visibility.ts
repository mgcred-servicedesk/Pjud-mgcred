import { sql, type SQL, type AnyColumn } from 'drizzle-orm';
import { tasks } from '../db/schema.ts';
import type { Actor } from './actor.ts';

type Ref = AnyColumn | SQL;

// Demanda: todas (requests.view_all), as próprias ou as compartilhadas.
export function canSeeRequest(actor: Actor, requestId: Ref): SQL {
  if (actor.permissions.has('requests.view_all')) return sql`true`;
  return sql`EXISTS (SELECT 1 FROM requests r WHERE r.id = ${requestId} AND (r.requester_id = ${actor.id}
    OR EXISTS (SELECT 1 FROM request_access a WHERE a.request_id = r.id AND a.user_id = ${actor.id})))`;
}

// Processo: todos (cases.view_all), liberados a todos, ou liberados ao usuário ou ao setor dele.
export function canSeeCase(actor: Actor, caseId: Ref): SQL {
  if (actor.permissions.has('cases.view_all')) return sql`true`;
  return sql`EXISTS (SELECT 1 FROM cases c WHERE c.id = ${caseId} AND (c.client_visible
    OR EXISTS (SELECT 1 FROM case_access a WHERE a.case_id = c.id AND (a.user_id = ${actor.id} OR a.department_id = ${actor.departmentId}))))`;
}

// Tarefa: todas (tasks.view_all) ou atribuídas ao usuário, desde que ele veja a demanda e o processo vinculados.
export function canSeeTask(actor: Actor): SQL {
  if (actor.permissions.has('tasks.view_all')) return sql`true`;
  return sql`(${tasks.assigneeId} = ${actor.id}
    AND (${tasks.requestId} IS NULL OR ${canSeeRequest(actor, tasks.requestId)})
    AND (${tasks.caseId} IS NULL OR ${canSeeCase(actor, tasks.caseId)}))`;
}

// Eventos de mensagens internas não aparecem para quem não pode lê-las.
export function canSeeAuditDetails(actor: Actor, details: Ref): SQL {
  if (actor.permissions.has('messages.internal')) return sql`true`;
  return sql`coalesce((${details}->>'internal')::boolean, false) = false`;
}
