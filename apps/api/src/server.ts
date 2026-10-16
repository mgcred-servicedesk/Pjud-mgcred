import { buildApp } from './app.ts';
import { bootstrapAdmin } from './services/bootstrap.ts';

const { app, ctx } = await buildApp();
const bootstrapEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
if (await bootstrapAdmin(ctx.db, { email: bootstrapEmail, password: process.env.BOOTSTRAP_ADMIN_PASSWORD }) === 'created')
  console.log(`Administrador inicial criado: ${bootstrapEmail}. Remova BOOTSTRAP_ADMIN_PASSWORD do ambiente após o primeiro acesso.`);
const port = Number(process.env.PORT || 4320);
const host = process.env.HOST || '127.0.0.1';
await app.listen({ port, host });
console.log(`Portal MG Cred: ${ctx.config.origin} (escutando em ${host}:${port})`);

for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => { app.close().then(() => process.exit(0), () => process.exit(1)); });
