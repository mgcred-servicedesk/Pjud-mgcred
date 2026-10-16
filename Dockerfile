# Portal Jurídico MG Cred — imagem única (API Fastify + interface React).
# A API roda o TypeScript direto no Node 24 (remoção de tipos), sem etapa de compilação.

FROM node:24-bookworm-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm --filter @mgcred/web build

FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --prod --frozen-lockfile --filter @mgcred/api... && pnpm store prune
COPY packages/shared/src packages/shared/src
COPY apps/api/src apps/api/src
COPY apps/api/drizzle apps/api/drizzle
COPY --from=build /app/apps/web/dist apps/web/dist
ENV WEB_DIST=/app/apps/web/dist HOST=0.0.0.0 PORT=4320
USER node
WORKDIR /app/apps/api
EXPOSE 4320
# As migrações precisam terminar antes de o servidor começar a aceitar requisições
# (o plano gratuito do Render não oferece pre-deploy command).
CMD ["/bin/sh", "-c", "node src/db/migrate.ts && exec node src/server.ts"]
