import { eq, sql } from 'drizzle-orm';
import type { Me, Permission } from '@mgcred/shared';
import type { Executor } from '../db/client.ts';
import { departments, rolePermissions, roles, users } from '../db/schema.ts';
import { fail } from '../lib/errors.ts';

export interface Actor {
  id: string;
  name: string;
  email: string;
  active: boolean;
  departmentId: string | null;
  departmentName: string | null;
  role: { id: string; code: string; name: string };
  permissions: Set<Permission>;
}

const permissionList = sql<Permission[]>`coalesce((SELECT array_agg(${rolePermissions.permissionCode} ORDER BY ${rolePermissions.permissionCode}) FROM ${rolePermissions} WHERE ${rolePermissions.roleId} = ${users.roleId}), '{}')`;

export const actorColumns = {
  id: users.id,
  name: users.name,
  email: users.email,
  active: users.active,
  departmentId: users.departmentId,
  departmentName: departments.name,
  roleId: roles.id,
  roleCode: roles.code,
  roleName: roles.name,
  permissions: permissionList,
  createdAt: users.createdAt,
};

type ActorRow = { [K in keyof typeof actorColumns]: unknown } & { permissions: Permission[] };

export function actorFromRow(row: ActorRow): Actor {
  return {
    id: row.id as string,
    name: row.name as string,
    email: row.email as string,
    active: row.active as boolean,
    departmentId: (row.departmentId as string | null) ?? null,
    departmentName: (row.departmentName as string | null) ?? null,
    role: { id: row.roleId as string, code: row.roleCode as string, name: row.roleName as string },
    permissions: new Set(row.permissions),
  };
}

export function actorQuery(exec: Executor) {
  return exec.select(actorColumns).from(users)
    .innerJoin(roles, eq(roles.id, users.roleId))
    .leftJoin(departments, eq(departments.id, users.departmentId));
}

export async function loadActor(exec: Executor, id: string): Promise<Actor | null> {
  const [row] = await actorQuery(exec).where(eq(users.id, id));
  return row ? actorFromRow(row) : null;
}

export async function activeActor(exec: Executor, id: string): Promise<Actor> {
  const actor = await loadActor(exec, id);
  if (!actor?.active) fail(400, 'Usuário indisponível.');
  return actor;
}

export function can(actor: Actor, permission: Permission) {
  return actor.permissions.has(permission);
}

export function requirePermission(actor: Actor, permission: Permission) {
  if (!can(actor, permission)) fail(403, 'Ação não permitida para o seu perfil.');
}

export function toMe(a: Actor): Me {
  return {
    id: a.id, name: a.name, email: a.email, active: a.active,
    department: a.departmentId ? { id: a.departmentId, name: a.departmentName ?? '' } : null,
    role: a.role,
    permissions: [...a.permissions].sort(),
  };
}
