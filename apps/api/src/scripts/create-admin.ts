// Cria o primeiro administrador ou emite link de recuperação para um administrador existente.
// Uso: node src/scripts/create-admin.ts --email adm@empresa.com.br [--name "Nome"] [--recover]
import { and, eq, sql } from 'drizzle-orm';
import { loadConfig } from '../config.ts';
import { createDb } from '../db/client.ts';
import { roles, users } from '../db/schema.ts';
import { email, text } from '../lib/validate.ts';
import { audit } from '../services/audit.ts';
import { issueInvitation } from '../routes/admin.ts';

const args = process.argv.slice(2);
const arg = (k: string) => (args.includes(k) ? args[args.indexOf(k) + 1] : undefined);
if (!args.includes('--email')) {
  console.error('Uso: node src/scripts/create-admin.ts --email administrador@empresa.com.br [--name "Administrador Jurídico"] [--recover]');
  process.exit(1);
}

const config = loadConfig();
const { db, pool } = createDb(config.databaseUrl);
try {
  const mail = email(arg('--email'));
  const name = text(arg('--name') ?? 'Administrador Jurídico', 'Nome', 100);
  const recover = args.includes('--recover');
  const url = await db.transaction(async tx => {
    const [adminRole] = await tx.select({ id: roles.id }).from(roles).where(eq(roles.code, 'admin_juridico'));
    if (!adminRole) throw new Error('Perfil admin_juridico ausente. Rode as migrações.');
    let [user] = await tx.select({ id: users.id, roleId: users.roleId }).from(users).where(eq(sql`lower(${users.email})`, mail));
    if (user) {
      if (!recover) throw new Error('Usuário já existe. Use --recover para emitir um novo link de recuperação.');
      if (user.roleId !== adminRole.id) throw new Error('Recuperação por este comando permitida apenas para administradores.');
    } else {
      const admins = await tx.select({ id: users.id }).from(users).where(and(eq(users.roleId, adminRole.id)));
      if (admins.length && !recover) throw new Error('Já existe administrador. Cadastre usuários pela interface.');
      [user] = await tx.insert(users).values({ email: mail, name, roleId: adminRole.id }).returning({ id: users.id, roleId: users.roleId });
    }
    await tx.update(users).set({ active: true }).where(eq(users.id, user!.id));
    await audit(tx, null, 'ativação.emitida.pela.ti', 'user', user!.id);
    return issueInvitation(tx, config.origin, user!.id, null);
  });
  console.log(`Administrador: ${mail}\nAbra este link pessoal para definir a senha (validade de 24 horas):\n${url}\nNão envie o link a terceiros nem o salve em arquivos públicos.`);
} catch (e) {
  console.error('Erro: ' + (e as Error).message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
