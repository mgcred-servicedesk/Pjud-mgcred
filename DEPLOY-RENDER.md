# Implantação gratuita no Render — MVP do Portal Jurídico MG Cred

O `render.yaml` na raiz cria dois recursos gratuitos na região **Virginia (EUA)**:

| Recurso | Tipo | Plano | Observação |
|---|---|---|---|
| `mgcred-juridico` | Web service (Docker) | `free` | API + interface na mesma imagem; migrações rodam antes da inicialização da API |
| `mgcred-juridico-db` | Render Postgres 18 | `free`, 1 GB | Só aceita conexões da rede privada (`ipAllowList: []`); guarda banco **e anexos** |

> Esta configuração serve apenas para demonstração do MVP. Não inserir dados pessoais, documentos jurídicos ou qualquer informação real.
>
> O PostgreSQL gratuito expira 30 dias após a criação, não possui backup e é apagado ao fim do período de tolerância do Render.

## 1. Pré-requisitos

1. Repositório no GitHub, GitLab ou Bitbucket com este projeto (o Render faz o deploy a partir do Git).
2. Conta no Render com workspace **Hobby**. Não é necessário cadastrar forma de pagamento para estes recursos gratuitos.
3. Endereço de e-mail do administrador da demonstração.

## 2. Primeiro deploy

1. No Render: **New → Blueprint**, selecione o repositório e a branch. O Render lê o `render.yaml`.
2. Quando solicitado, informe `BOOTSTRAP_ADMIN_EMAIL`. O valor não fica gravado no repositório.
3. Confirme a criação. A ordem é: banco → build da imagem → migrações → início do serviço → verificação em `/healthz` → criação do administrador.
4. Se o nome `mgcred-juridico` estiver ocupado, o Render gera outro endereço (`mgcred-juridico-xxxx.onrender.com`). Nesse caso, ajuste `APP_ORIGIN` no painel antes de usar o portal — gravações vindas de outra origem são recusadas.

## 3. Ativar o primeiro administrador

O plano gratuito não oferece Shell. Depois do primeiro deploy, abra os logs do evento **Initial Deploy Hook** do serviço. O comando configurado no Blueprint mostra um endereço como:

```text
Abra este link pessoal para definir a senha (validade de 24 horas):
https://mgcred-juridico.onrender.com/ativar/...
```

Abra o link e defina a senha. Ele é pessoal, vale por 24 horas e deixa de funcionar depois da ativação.

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
| `MAX_STORAGE_BYTES` | `536870912` | Cota total de anexos (512 MB), deixando espaço para tabelas, índices e auditoria |
| `BOOTSTRAP_ADMIN_EMAIL` | informado no primeiro deploy | E-mail usado pelo hook para criar o administrador inicial |
| `DATABASE_URL` | do banco (automático) | Conexão pela rede privada |
| `HOST`, `PORT`, `WEB_DIST` | definidos no `Dockerfile` | — |

## 6. Persistência e expiração

- O banco gratuito tem capacidade fixa de **1 GB**. O portal limita os anexos a um total de 512 MB para reservar espaço para tabelas, índices e auditoria.
- O banco expira depois de **30 dias**. O Render concede mais 14 dias para upgrade; depois disso, banco e anexos são apagados.
- Não existe backup nem recuperação para um ponto no tempo no plano gratuito.
- Para uma nova apresentação depois da expiração, remova os recursos expirados e crie novamente o Blueprint com dados fictícios.

## 7. Operação

- **Inatividade**: depois de 15 minutos sem requisições, o serviço entra em suspensão. O primeiro acesso seguinte pode levar cerca de um minuto.
- **Deploy**: cada commit na branch configurada redeploya (`autoDeployTrigger: commit`).
- **Migrações**: novas migrações em `apps/api/drizzle/` (gere com `pnpm db:generate`) rodam antes da API em cada inicialização. Se falharem, o serviço não inicia.
- **Logs**: aba **Logs** do serviço. Erros 5xx são registrados em JSON, sem dados pessoais.
- **Validação do Blueprint**: `render blueprints validate render.yaml` (Render CLI ≥ 2.7).
