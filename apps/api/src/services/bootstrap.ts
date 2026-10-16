// Administrador inicial definido por variáveis de ambiente (BOOTSTRAP_ADMIN_EMAIL + BOOTSTRAP_ADMIN_PASSWORD).
// Só age enquanto não houver nenhum administrador; depois disso as variáveis são ignoradas.
import { eq, sql } from 'drizzle-orm';
import type { Executor } from '../db/client.ts';
import { roles, users } from '../db/schema.ts';
import { hashPassword } from '../lib/crypto.ts';
import { email, password, text } from '../lib/validate.ts';
import { audit } from './audit.ts';

export interface BootstrapAdmin { email?: string; password?: string; name?: string }

export async function bootstrapAdmin(db: Executor, input: BootstrapAdmin): Promise<'created' | 'skipped'> {
  // Só o e-mail (sem senha) é o fluxo por link do create-admin: nada a fazer aqui.
  if (!input.password) return 'skipped';
  if (!input.email) throw new Error('BOOTSTRAP_ADMIN_PASSWORD exige BOOTSTRAP_ADMIN_EMAIL.');
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('mgcred:bootstrap-admin'))`);
    const [adminRole] = await tx.select({ id: roles.id }).from(roles).where(eq(roles.code, 'admin_juridico'));
    if (!adminRole) throw new Error('Perfil admin_juridico ausente. Rode as migrações.');
    const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.roleId, adminRole.id)).limit(1);
    if (existing) return 'skipped';
    const mail = email(input.email);
    const name = text(input.name ?? 'Administrador Jurídico', 'Nome', 100);
    const [taken] = await tx.select({ id: users.id }).from(users).where(eq(sql`lower(${users.email})`, mail));
    if (taken) throw new Error('BOOTSTRAP_ADMIN_EMAIL pertence a um usuário que não é administrador.');
    const passwordHash = await hashPassword(password(input.password));
    const [user] = await tx.insert(users).values({ email: mail, name, roleId: adminRole.id, passwordHash }).returning({ id: users.id });
    await audit(tx, null, 'administrador.inicial.criado', 'user', user!.id);
    return 'created';
  });
}
