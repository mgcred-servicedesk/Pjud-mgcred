# Portal Jurídico MG Cred

Portal interno do Jurídico da MG Cred para demandas, processos, tarefas e prazos, documentos, relatórios, Compliance/LGPD e administração de usuários.

Usuários da MG Cred abrem e acompanham solicitações. O Jurídico gerencia status, responsáveis, processos e tarefas. Toda autorização é verificada no servidor e todas as alterações relevantes ficam registradas numa auditoria que só aceita inclusões.

## Stack

| Camada | Tecnologia |
|---|---|
| Interface | React 19 + Vite, TypeScript |
| API | Node.js 24 + Fastify 5, TypeScript executado direto pelo Node (sem build) |
| Banco | PostgreSQL 18 com Drizzle ORM e migrações versionadas |
| Anexos | No PostgreSQL (`document_contents`), atrás de uma interface pronta para S3 |
| Testes | Vitest (integração contra PostgreSQL real) |
| Hospedagem | Render (Blueprint em `render.yaml`) |

## Estrutura

```
apps/
  api/            API Fastify
    src/
      db/         schema Drizzle, conexão e migrador
      routes/     auth, state, requests, cases, tasks, admin
      services/   permissões, visibilidade, auditoria, storage, consultas
      lib/        validações, criptografia, CSV, arquivos
      scripts/    create-admin (primeiro administrador)
    drizzle/      migrações SQL (fonte da verdade do banco)
    test/         testes de integração
  web/            interface React
    public/       identidade visual (CSS, logos, fontes Poppins)
    src/          páginas, janelas e cliente da API
packages/
  shared/         enums, rótulos, permissões e contratos da API
operacional/      MVP anterior (Node + SQLite), mantido como referência
```

## Pré-requisitos

- Node.js 24 (`>=24.13`)
- pnpm 10 (`corepack enable`)
- Docker, para o PostgreSQL local

## Executar localmente

```sh
# 1. Banco de desenvolvimento
docker run -d --name mgcred-pg -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=mgcred \
  -p 127.0.0.1:5433:5432 postgres:18-alpine

# 2. Dependências e configuração
pnpm install
cp apps/api/.env.example apps/api/.env

# 3. Migrações e primeiro administrador (mostra o link de ativação)
pnpm db:migrate
pnpm --filter @mgcred/api create-admin --email admin@exemplo.test --name "Administrador"

# 4. API (:4320) e interface (:5173), em terminais separados
pnpm dev:api
pnpm dev:web
```

Abra o link de ativação, defina a senha e entre em http://127.0.0.1:5173. O Vite repassa `/api` para a API. Por isso o `APP_ORIGIN` do `.env` precisa ser `http://127.0.0.1:5173`, que também é a origem usada nos links de ativação.

Para servir tudo pela API, como em produção, rode `pnpm build`, defina `WEB_DIST=../web/dist` e `APP_ORIGIN=http://127.0.0.1:4320` no `.env` e use só `pnpm dev:api`.

## Comandos

| Comando | O que faz |
|---|---|
| `pnpm dev:api` / `pnpm dev:web` | API com recarga automática / interface com Vite |
| `pnpm typecheck` | Verificação de tipos em todos os pacotes |
| `pnpm test` | Testes de integração da API (exige PostgreSQL, ver abaixo) |
| `pnpm build` | Build da interface em `apps/web/dist` |
| `pnpm db:generate` | Gera migração a partir de `apps/api/src/db/schema.ts` |
| `pnpm db:migrate` | Aplica as migrações pendentes |

### Testes

Os testes usam o servidor PostgreSQL em `TEST_DATABASE_URL`. O padrão é `postgres://postgres:dev@127.0.0.1:5433/postgres`, o mesmo container de desenvolvimento. Cada execução cria um banco temporário, aplica as migrações e o remove no final.

```sh
pnpm test
```

## Variáveis de ambiente (API)

| Variável | Descrição |
|---|---|
| `DATABASE_URL` | Conexão PostgreSQL |
| `APP_ORIGIN` | Origem exata do portal. HTTPS obrigatório em produção |
| `NODE_ENV` | `production` ativa cookie `__Host-`/`Secure` e HSTS |
| `HOST`, `PORT` | Endereço de escuta (padrão `127.0.0.1:4320`) |
| `WEB_DIST` | Pasta da interface compilada a ser servida pela API |
| `CLIENT_IP_HEADER` | Cabeçalho com o IP real do cliente (`cf-connecting-ip` no Render) |
| `MAX_STORAGE_BYTES` | Cota total de anexos (padrão 2 GB) |

## Segurança

- Senhas com scrypt; sessões opacas guardadas só como hash, com expiração de 8 h ou 30 min sem uso.
- Verificação de origem e token CSRF em toda gravação; limite de tentativas de login por IP e por conta.
- CSP restritiva, `X-Frame-Options`, `nosniff` e HSTS.
- Permissões por perfil (`roles` e `permissions`), checadas em cada rota e em cada consulta.
- Anexos com lista de formatos, verificação da assinatura binária e SHA-256; todo download é autorizado e auditado.
- Concorrência otimista (`version`) nos registros editáveis.

## Implantação

O deploy é feito no Render pelo Blueprint `render.yaml`: um web service Docker e um Render Postgres 18, na região Virginia. As migrações rodam automaticamente antes de cada deploy. O passo a passo está em [DEPLOY-RENDER.md](DEPLOY-RENDER.md).

## Documentação

| Arquivo | Conteúdo |
|---|---|
| [MODELO-DADOS.md](MODELO-DADOS.md) | Modelo de dados, permissões e regras de visibilidade |
| [DEPLOY-RENDER.md](DEPLOY-RENDER.md) | Implantação, domínio, backup e operação no Render |
| [REVIEW.md](REVIEW.md) / [REVIEW-RESUMO.md](REVIEW-RESUMO.md) | Análise do MVP anterior e requisitos funcionais |
| [IDENTIDADE-VISUAL.md](IDENTIDADE-VISUAL.md) | Cores, fonte e logotipos MG Cred |
| [AGENTS.md](AGENTS.md) | Convenções e comandos para quem desenvolve no projeto |
