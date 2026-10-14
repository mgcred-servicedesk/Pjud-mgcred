# Implantação no Render — Portal Jurídico MG Cred

O `render.yaml` na raiz cria dois recursos na região **Virginia (EUA)**:

| Recurso | Tipo | Plano | Observação |
|---|---|---|---|
| `mgcred-juridico` | Web service (Docker) | `0.5c-512mb` | API + interface na mesma imagem; migrações rodam no `preDeployCommand` |
| `mgcred-juridico-db` | Render Postgres 18 | `0.1c-256mb`, 5 GB | Só aceita conexões da rede privada (`ipAllowList: []`); guarda banco **e anexos** |

> Dados hospedados nos EUA: transferência internacional (LGPD, art. 33), aprovada em 14/10/2026. Firmar o DPA do Render.
> O plano `free` do Postgres expira em 30 dias e não tem backup — não usar.

## 1. Pré-requisitos

1. Repositório no GitHub, GitLab ou Bitbucket com este projeto (o Render faz o deploy a partir do Git).
2. Conta no Render com forma de pagamento (planos pagos).
3. Domínio definitivo (opcional no primeiro deploy).

## 2. Primeiro deploy

1. No Render: **New → Blueprint**, selecione o repositório e a branch. O Render lê o `render.yaml`.
2. Confirme a criação. A ordem é: banco → build da imagem → `node src/db/migrate.ts` → início do serviço → verificação em `/healthz`.
3. Se o nome `mgcred-juridico` estiver ocupado, o Render gera outro endereço (`mgcred-juridico-xxxx.onrender.com`). Nesse caso, ajuste `APP_ORIGIN` (passo 4) — o portal recusa gravações vindas de outra origem.

## 3. Primeiro administrador

No painel do serviço, abra **Shell** e execute:

```sh
node src/scripts/create-admin.ts --email administrador@mgcred.com.br --name "Nome do Administrador"
```

O comando mostra um link pessoal de ativação (24 h). Entregue-o por canal seguro. Para recuperar o acesso de um administrador: acrescente `--recover`.

Os demais usuários são criados pela tela **Administração**, que também gera os links de ativação.

## 4. Domínio próprio

1. Em **Settings → Custom Domains** do serviço, adicione o domínio e crie o registro DNS indicado (CNAME). O certificado HTTPS é emitido pelo Render.
2. No `render.yaml`, troque `APP_ORIGIN` por `https://SEU-DOMINIO` e descomente `domains`. Faça commit — o Blueprint sincroniza e redeploya.
3. Depois que o domínio responder, descomente `renderSubdomainPolicy: disabled` para desligar o endereço `onrender.com`.

## 5. Variáveis de ambiente

| Variável | Valor | Motivo |
|---|---|---|
| `NODE_ENV` | `production` | Cookie `__Host-` com `Secure`, HSTS, exige HTTPS em `APP_ORIGIN` |
| `APP_ORIGIN` | origem exata do portal | Verificação de origem nas gravações e links de ativação |
| `CLIENT_IP_HEADER` | `x-forwarded-for` | IP real do usuário encaminhado pelo proxy do Render (limite de tentativas de login por IP) |
| `MAX_STORAGE_BYTES` | `2147483648` | Cota total de anexos (2 GB) |
| `DATABASE_URL` | do banco (automático) | Conexão pela rede privada |
| `HOST`, `PORT`, `WEB_DIST` | definidos no `Dockerfile` | — |

## 6. Backup e restauração

- O Render Postgres pago faz backup contínuo com recuperação para um ponto no tempo (PITR): janela de **3 dias** no workspace Hobby e **7 dias** no Pro. Como os anexos ficam no banco, **um único backup cobre tudo**.
- Restauração: painel do banco → **Recovery** → cria uma nova instância no ponto escolhido; aponte `DATABASE_URL` para ela.
- Cópia para guarda longa: **Recovery → Create export** (retida 7 dias pelo Render; baixe e guarde em local da MG Cred) ou `pg_dump` pela URL externa.
- Backup externo (S3) fica para a fase seguinte, junto com a migração dos anexos para S3.

## 7. Operação

- **Deploy**: cada commit na branch configurada redeploya (`autoDeployTrigger: commit`), sem downtime (não há disco).
- **Migrações**: novas migrações em `apps/api/drizzle/` (gere com `pnpm db:generate`) rodam sozinhas antes de cada deploy. Se falharem, o deploy é cancelado e a versão anterior continua no ar.
- **Logs**: aba **Logs** do serviço. Erros 5xx são registrados em JSON, sem dados pessoais.
- **Validação do Blueprint**: `render blueprints validate render.yaml` (Render CLI ≥ 2.7).
