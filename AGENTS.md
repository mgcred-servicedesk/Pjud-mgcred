# Portal Jurídico MG Cred — guia do projeto

## Estrutura
- `apps/api` — API Fastify + Drizzle (PostgreSQL), TypeScript executado direto pelo Node 24 (remoção de tipos; sem build). Imports com extensão `.ts`; sem `enum`/parameter properties (`erasableSyntaxOnly`).
- `apps/web` — React + Vite. Folhas de estilo da identidade visual em `apps/web/public/` (copiadas do MVP; não alterar `styles.css`, `original-theme.css`, `brand.css`, `portal.css` — ajustes novos em `app.css`).
- `packages/shared` — enums, rótulos, permissões e contratos da API (consumido em `.ts` pelos dois apps).
- `operacional/` — MVP antigo (Node + SQLite), mantido como referência. `original/` e `dist/` — protótipo e demonstração antigos.
- Modelo de dados: `MODELO-DADOS.md`. Implantação: `DEPLOY-RENDER.md` + `render.yaml`.

## Comandos (raiz, pnpm 10)
- `pnpm install` — `minimumReleaseAge` de 7 dias em `pnpm-workspace.yaml` (não reduzir).
- `pnpm typecheck` — TypeScript (tsc 7) em todos os pacotes.
- `pnpm test` — 22 testes de integração da API (Vitest). Exigem PostgreSQL em `TEST_DATABASE_URL` (padrão `postgres://postgres:dev@127.0.0.1:5433/postgres`); cada execução cria e remove um banco temporário.
- `pnpm build` — build da interface (`apps/web/dist`).
- `pnpm db:generate` — gera migração a partir de `apps/api/src/db/schema.ts`; `pnpm db:migrate` aplica (usa `apps/api/.env`).

## Ambiente local
```sh
docker run -d --name mgcred-pg -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=mgcred -p 127.0.0.1:5433:5432 postgres:18-alpine
cp apps/api/.env.example apps/api/.env
pnpm db:migrate
pnpm --filter @mgcred/api create-admin --email admin@exemplo.test
pnpm dev:api   # :4320
pnpm dev:web   # :5173 (APP_ORIGIN=http://127.0.0.1:5173 no .env da API)
```

## Regras
- Autorização sempre no servidor por permissão (`requirePermission`, `services/visibility.ts`); esconder botão não é controle.
- Toda alteração relevante grava em `audit_log` (somente inclusão por trigger).
- Registros editáveis usam concorrência otimista (`version`).
- Neste computador o Kaspersky intercepta TLS dentro do Docker: para testar o build local, injete o certificado da CA local num Dockerfile temporário (não alterar o `Dockerfile` do projeto).
