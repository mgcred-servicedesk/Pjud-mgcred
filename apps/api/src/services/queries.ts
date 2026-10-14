import { and, asc, desc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { AuditEvent, CaseItem, FileInfo, RequestItem, TaskItem } from '@mgcred/shared';
import type { Executor } from '../db/client.ts';
import { auditLog, cases, departments, documents, requestCategories, requests, tasks, users } from '../db/schema.ts';
import type { Actor } from './actor.ts';
import { canSeeAuditDetails, canSeeCase, canSeeRequest, canSeeTask } from './visibility.ts';

export const LIST_LIMIT = 1000;

const requester = alias(users, 'requester');
const owner = alias(users, 'owner');

export async function listRequests(exec: Executor, actor: Actor, where?: SQL, limit = LIST_LIMIT + 1): Promise<RequestItem[]> {
  const rows = await exec.select({
    r: requests,
    categoryName: requestCategories.name,
    isGovernance: requestCategories.isGovernance,
    requesterName: requester.name,
    ownerName: owner.name,
    departmentName: departments.name,
  }).from(requests)
    .innerJoin(requestCategories, eq(requestCategories.id, requests.categoryId))
    .innerJoin(requester, eq(requester.id, requests.requesterId))
    .leftJoin(owner, eq(owner.id, requests.ownerId))
    .leftJoin(departments, eq(departments.id, requests.departmentId))
    .where(and(canSeeRequest(actor, requests.id), where))
    .orderBy(desc(requests.updatedAt))
    .limit(limit);
  const files = await filesFor(exec, rows.map(x => x.r.id));
  return rows.map(({ r, ...x }) => ({
    id: r.id, code: r.code, subject: r.subject, description: r.description,
    category: { id: r.categoryId, name: x.categoryName, isGovernance: x.isGovernance },
    priority: r.priority, status: r.status,
    requester: { id: r.requesterId, name: x.requesterName },
    owner: r.ownerId ? { id: r.ownerId, name: x.ownerName ?? '' } : null,
    department: r.departmentId ? { id: r.departmentId, name: x.departmentName ?? '' } : null,
    createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(), version: r.version,
    files: files.get(r.id) ?? [],
  }));
}

async function filesFor(exec: Executor, requestIds: string[]) {
  const map = new Map<string, FileInfo[]>();
  if (!requestIds.length) return map;
  const rows = await exec.select({ id: documents.id, requestId: documents.requestId, name: documents.fileName, mimeType: documents.mimeType, size: documents.sizeBytes, createdAt: documents.createdAt })
    .from(documents).where(inArray(documents.requestId, requestIds)).orderBy(asc(documents.createdAt));
  for (const f of rows) {
    const list = map.get(f.requestId) ?? [];
    list.push({ id: f.id, name: f.name, mimeType: f.mimeType, size: f.size, createdAt: f.createdAt.toISOString(), url: '/api/documents/' + f.id });
    map.set(f.requestId, list);
  }
  return map;
}

export function mapCase(c: typeof cases.$inferSelect): CaseItem {
  return {
    id: c.id, number: c.number, title: c.title, party: c.party, opponent: c.opponent, court: c.court,
    division: c.division, phase: c.phase, status: c.status, risk: c.risk, claimValue: c.claimValue,
    nextDue: c.nextDue, notes: c.notes, clientVisible: c.clientVisible,
    createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString(), version: c.version,
  };
}

export async function listCases(exec: Executor, actor: Actor): Promise<CaseItem[]> {
  const rows = await exec.select().from(cases).where(canSeeCase(actor, cases.id)).orderBy(desc(cases.updatedAt)).limit(LIST_LIMIT + 1);
  return rows.map(mapCase);
}

export async function listTasks(exec: Executor, actor: Actor): Promise<TaskItem[]> {
  const assignee = alias(users, 'assignee');
  const rows = await exec.select({ t: tasks, assigneeName: assignee.name, requestCode: requests.code, caseNumber: cases.number })
    .from(tasks)
    .leftJoin(assignee, eq(assignee.id, tasks.assigneeId))
    .leftJoin(requests, eq(requests.id, tasks.requestId))
    .leftJoin(cases, eq(cases.id, tasks.caseId))
    .where(canSeeTask(actor))
    .orderBy(asc(tasks.status), asc(tasks.dueDate))
    .limit(LIST_LIMIT + 1);
  return rows.map(({ t, ...x }) => ({
    id: t.id, title: t.title, description: t.description, dueDate: t.dueDate, priority: t.priority, status: t.status,
    assignee: t.assigneeId ? { id: t.assigneeId, name: x.assigneeName ?? '' } : null,
    request: t.requestId ? { id: t.requestId, code: x.requestCode ?? '' } : null,
    caseRef: t.caseId ? { id: t.caseId, number: x.caseNumber ?? '' } : null,
    version: t.version,
  }));
}

const auditActor = alias(users, 'audit_actor');
const entityLabel = sql<string | null>`CASE ${auditLog.entityType}
  WHEN 'request' THEN (SELECT code FROM requests WHERE id = ${auditLog.entityId})
  WHEN 'case' THEN (SELECT number FROM cases WHERE id = ${auditLog.entityId})
  WHEN 'user' THEN (SELECT name FROM users WHERE id = ${auditLog.entityId})
  WHEN 'task' THEN (SELECT title FROM tasks WHERE id = ${auditLog.entityId})
  ELSE NULL END`;

export async function auditEvents(exec: Executor, where: SQL | undefined, limit: number): Promise<AuditEvent[]> {
  const rows = await exec.select({ a: auditLog, actor: auditActor.name, entityLabel })
    .from(auditLog).leftJoin(auditActor, eq(auditActor.id, auditLog.actorId))
    .where(where).orderBy(desc(auditLog.id)).limit(limit);
  return rows.map(({ a, actor, entityLabel: lbl }) => ({
    id: a.id, action: a.action, entityType: a.entityType, entityId: a.entityId, entityLabel: lbl,
    details: a.details, actor, createdAt: a.createdAt.toISOString(),
  }));
}

export function requestHistoryFilter(actor: Actor, requestId?: string): SQL {
  return and(
    eq(auditLog.entityType, 'request'),
    requestId ? eq(auditLog.entityId, requestId) : canSeeRequest(actor, auditLog.entityId),
    canSeeAuditDetails(actor, auditLog.details),
  )!;
}
