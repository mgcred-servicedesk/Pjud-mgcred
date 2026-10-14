import { buildApp } from './app.ts';

const { app, ctx } = await buildApp();
const port = Number(process.env.PORT || 4320);
const host = process.env.HOST || '127.0.0.1';
await app.listen({ port, host });
console.log(`Portal MG Cred: ${ctx.config.origin} (escutando em ${host}:${port})`);

for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.on(signal, () => { app.close().then(() => process.exit(0), () => process.exit(1)); });
