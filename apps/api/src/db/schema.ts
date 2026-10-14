import { sql } from 'drizzle-orm';
import {
  bigint, boolean, char, check, customType, date, index, integer, jsonb, numeric, pgEnum, pgTable,
  primaryKey, smallint, text, timestamp, uniqueIndex, uuid, varchar,
} from 'drizzle-orm/pg-core';
import { caseRisks, caseStatuses, priorities, requestStatuses, taskStatuses } from '@mgcred/shared';

const bytea = customType<{ data: Buffer }>({ dataType: () => 'bytea' });
const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();
const rowVersion = () => integer('version').notNull().default(1);

export const priority = pgEnum('priority', priorities);
export const requestStatus = pgEnum('request_status', requestStatuses);
export const caseStatus = pgEnum('case_status', caseStatuses);
export const caseRisk = pgEnum('case_risk', caseRisks);
export const taskStatus = pgEnum('task_status', taskStatuses);

// ===== Setores, perfis e usuários =====
export const departments = pgTable('departments', {
  id: id(),
  name: varchar('name', { length: 80 }).notNull().unique(),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
});

export const roles = pgTable('roles', {
  id: id(),
  code: varchar('code', { length: 40 }).notNull().unique(),
  name: varchar('name', { length: 80 }).notNull(),
  description: text('description'),
  isSystem: boolean('is_system').notNull().default(false),
  createdAt: createdAt(),
});

export const permissions = pgTable('permissions', {
  code: varchar('code', { length: 60 }).primaryKey(),
  description: text('description').notNull(),
});

export const rolePermissions = pgTable('role_permissions', {
  roleId: uuid('role_id').notNull().references(() => roles.id, { onDelete: 'cascade' }),
  permissionCode: varchar('permission_code', { length: 60 }).notNull().references(() => permissions.code),
}, t => [primaryKey({ columns: [t.roleId, t.permissionCode] })]);

export const users = pgTable('users', {
  id: id(),
  email: varchar('email', { length: 254 }).notNull(),
  name: varchar('name', { length: 100 }).notNull(),
  departmentId: uuid('department_id').references(() => departments.id),
  roleId: uuid('role_id').notNull().references(() => roles.id),
  passwordHash: text('password_hash'),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  version: rowVersion(),
}, t => [
  uniqueIndex('users_email_uq').on(sql`lower(${t.email})`),
  index('users_department_idx').on(t.departmentId),
  index('users_role_idx').on(t.roleId),
]);

// ===== Autenticação =====
export const sessions = pgTable('sessions', {
  tokenHash: char('token_hash', { length: 64 }).primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  csrfToken: text('csrf_token').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull(),
  createdAt: createdAt(),
}, t => [index('sessions_user_idx').on(t.userId), index('sessions_expires_idx').on(t.expiresAt)]);

export const invitations = pgTable('invitations', {
  tokenHash: char('token_hash', { length: 64 }).primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdBy: uuid('created_by').references(() => users.id),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: createdAt(),
}, t => [index('invitations_user_idx').on(t.userId)]);

export const rateLimits = pgTable('rate_limits', {
  key: text('key').primaryKey(),
  count: integer('count').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});

// ===== Demandas =====
export const requestCategories = pgTable('request_categories', {
  id: id(),
  name: varchar('name', { length: 60 }).notNull().unique(),
  isGovernance: boolean('is_governance').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  active: boolean('active').notNull().default(true),
});

export const requestSequences = pgTable('request_sequences', {
  prefix: varchar('prefix', { length: 10 }).notNull(),
  year: smallint('year').notNull(),
  lastValue: integer('last_value').notNull(),
}, t => [primaryKey({ columns: [t.prefix, t.year] })]);

export const requests = pgTable('requests', {
  id: id(),
  code: varchar('code', { length: 20 }).notNull().unique(),
  subject: varchar('subject', { length: 140 }).notNull(),
  description: varchar('description', { length: 5000 }).notNull(),
  categoryId: uuid('category_id').notNull().references(() => requestCategories.id),
  priority: priority('priority').notNull().default('normal'),
  status: requestStatus('status').notNull().default('nova'),
  requesterId: uuid('requester_id').notNull().references(() => users.id),
  ownerId: uuid('owner_id').references(() => users.id),
  departmentId: uuid('department_id').references(() => departments.id),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  version: rowVersion(),
}, t => [
  index('requests_status_idx').on(t.status, t.updatedAt.desc()),
  index('requests_requester_idx').on(t.requesterId),
  index('requests_owner_idx').on(t.ownerId),
  index('requests_category_idx').on(t.categoryId),
  index('requests_department_idx').on(t.departmentId),
]);

export const requestAccess = pgTable('request_access', {
  requestId: uuid('request_id').notNull().references(() => requests.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id),
  grantedBy: uuid('granted_by').references(() => users.id),
  grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [primaryKey({ columns: [t.requestId, t.userId] }), index('request_access_user_idx').on(t.userId)]);

export const requestMessages = pgTable('request_messages', {
  id: id(),
  requestId: uuid('request_id').notNull().references(() => requests.id, { onDelete: 'cascade' }),
  authorId: uuid('author_id').notNull().references(() => users.id),
  body: varchar('body', { length: 5000 }).notNull(),
  isInternal: boolean('is_internal').notNull().default(false),
  createdAt: createdAt(),
}, t => [index('request_messages_request_idx').on(t.requestId, t.createdAt)]);

export const documents = pgTable('documents', {
  id: id(),
  requestId: uuid('request_id').notNull().references(() => requests.id),
  fileName: varchar('file_name', { length: 180 }).notNull(),
  mimeType: varchar('mime_type', { length: 120 }).notNull(),
  sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
  sha256: char('sha256', { length: 64 }).notNull(),
  storageKey: text('storage_key').notNull().unique(),
  uploadedBy: uuid('uploaded_by').notNull().references(() => users.id),
  createdAt: createdAt(),
}, t => [index('documents_request_idx').on(t.requestId, t.createdAt), check('documents_size_check', sql`${t.sizeBytes} > 0`)]);

// Conteúdo dos anexos enquanto não há S3 (ver lib/storage.ts).
export const documentContents = pgTable('document_contents', {
  storageKey: text('storage_key').primaryKey(),
  content: bytea('content').notNull(),
});

// ===== Processos =====
export const cases = pgTable('cases', {
  id: id(),
  number: varchar('number', { length: 40 }).notNull().unique(),
  title: varchar('title', { length: 200 }).notNull(),
  party: varchar('party', { length: 150 }),
  opponent: varchar('opponent', { length: 150 }),
  court: varchar('court', { length: 80 }),
  division: varchar('division', { length: 120 }),
  phase: varchar('phase', { length: 80 }),
  status: caseStatus('status').notNull().default('ativo'),
  risk: caseRisk('risk').notNull().default('nao_avaliado'),
  claimValue: numeric('claim_value', { precision: 15, scale: 2 }).notNull().default('0'),
  nextDue: date('next_due'),
  notes: varchar('notes', { length: 5000 }),
  clientVisible: boolean('client_visible').notNull().default(false),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  version: rowVersion(),
}, t => [
  index('cases_status_idx').on(t.status, t.updatedAt.desc()),
  index('cases_visible_idx').on(t.clientVisible).where(sql`${t.clientVisible}`),
  check('cases_claim_value_check', sql`${t.claimValue} >= 0`),
]);

export const caseAccess = pgTable('case_access', {
  id: id(),
  caseId: uuid('case_id').notNull().references(() => cases.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').references(() => users.id),
  departmentId: uuid('department_id').references(() => departments.id),
  grantedBy: uuid('granted_by').references(() => users.id),
  grantedAt: timestamp('granted_at', { withTimezone: true }).notNull().defaultNow(),
}, t => [
  check('case_access_target_check', sql`num_nonnulls(${t.userId}, ${t.departmentId}) = 1`),
  uniqueIndex('case_access_user_uq').on(t.caseId, t.userId).where(sql`${t.userId} IS NOT NULL`),
  uniqueIndex('case_access_department_uq').on(t.caseId, t.departmentId).where(sql`${t.departmentId} IS NOT NULL`),
  index('case_access_user_idx').on(t.userId).where(sql`${t.userId} IS NOT NULL`),
  index('case_access_department_idx').on(t.departmentId).where(sql`${t.departmentId} IS NOT NULL`),
]);

// ===== Tarefas / Prazos =====
export const tasks = pgTable('tasks', {
  id: id(),
  title: varchar('title', { length: 200 }).notNull(),
  description: varchar('description', { length: 3000 }),
  dueDate: date('due_date').notNull(),
  priority: priority('priority').notNull().default('normal'),
  status: taskStatus('status').notNull().default('pendente'),
  assigneeId: uuid('assignee_id').references(() => users.id),
  requestId: uuid('request_id').references(() => requests.id),
  caseId: uuid('case_id').references(() => cases.id),
  createdBy: uuid('created_by').references(() => users.id),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  version: rowVersion(),
}, t => [
  index('tasks_status_due_idx').on(t.status, t.dueDate),
  index('tasks_assignee_idx').on(t.assigneeId),
  index('tasks_request_idx').on(t.requestId),
  index('tasks_case_idx').on(t.caseId),
  check('tasks_completion_check', sql`(${t.status} = 'concluida') = (${t.completedAt} IS NOT NULL)`),
]);

// ===== Importação e auditoria =====
export const importBatches = pgTable('import_batches', {
  id: id(),
  kind: varchar('kind', { length: 20 }).notNull().default('cases'),
  fileSha256: char('file_sha256', { length: 64 }).notNull(),
  rowCount: integer('row_count').notNull(),
  createdBy: uuid('created_by').notNull().references(() => users.id),
  createdAt: createdAt(),
}, t => [check('import_batches_rows_check', sql`${t.rowCount} > 0`)]);

export const auditLog = pgTable('audit_log', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  actorId: uuid('actor_id').references(() => users.id),
  action: varchar('action', { length: 60 }).notNull(),
  entityType: varchar('entity_type', { length: 30 }).notNull(),
  entityId: uuid('entity_id'),
  details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
  createdAt: createdAt(),
}, t => [
  index('audit_entity_idx').on(t.entityType, t.entityId, t.id.desc()),
  index('audit_created_idx').on(t.createdAt.desc()),
  index('audit_actor_idx').on(t.actorId),
]);
