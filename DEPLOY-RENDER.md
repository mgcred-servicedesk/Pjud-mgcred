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
2. Quando solicitado, informe `BOOTSTRAP_ADMIN_EMAIL` e `BOOTSTRAP_ADMIN_PASSWORD` (de 14 a 128 caracteres; uma frase-senha serve). Os valores não ficam gravados no repositório.
3. Confirme a criação. A ordem é: banco → build da imagem → migrações → criação do administrador → início do serviço → verificação em `/healthz`.
4. Se o nome `mgcred-juridico` estiver ocupado, o Render gera outro endereço (`mgcred-juridico-xxxx.onrender.com`). Nesse caso, ajuste `APP_ORIGIN` no painel antes de usar o portal — gravações vindas de outra origem são recusadas.

## 3. Primeiro administrador

Ao iniciar, a API verifica se já existe algum administrador. Se não existir e `BOOTSTRAP_ADMIN_PASSWORD` estiver definida, ela cria o administrador com o e-mail de `BOOTSTRAP_ADMIN_EMAIL`, já ativo e com essa senha, e registra o evento na auditoria. O log do serviço mostra:

```text
Administrador inicial criado: admin@empresa.com.br. Remova BOOTSTRAP_ADMIN_PASSWORD do ambiente após o primeiro acesso.
```

Se já houver administrador, as variáveis são ignoradas. Elas não alteram a senha de ninguém.

### Serviço já criado (sem a variável de senha)

1. No [Dashboard do Render](https://dashboard.render.com), abra o serviço **mgcred-juridico** → **Environment**.
2. Em **Environment Variables**, clique em **+ Add Environment Variable**:
   - Key: `BOOTSTRAP_ADMIN_PASSWORD`, Value: a senha (14 a 128 caracteres).
   - Confira se `BOOTSTRAP_ADMIN_EMAIL` existe e tem o e-mail desejado. Se não existir, adicione também.
3. Clique em **Save, rebuild, and deploy** (ou **Save and deploy**). O serviço reinicia e cria o administrador.
4. Em **Logs**, procure a linha `Administrador inicial criado`. Se aparecer um `Erro`, a senha está curta ou o e-mail é inválido ou já pertence a um usuário comum.

Se o administrador já tiver sido criado antes pelo link do primeiro deploy e o link expirou, esta variável não resolve. Nesse caso, apague o banco e crie o Blueprint de novo, ou peça a outro administrador um novo link pela tela **Administração**.

### Depois do primeiro acesso

1. Entre no portal e troque a senha em **Minha conta → Alterar senha**, para que a senha definitiva não fique no painel do Render.
2. Em **Environment**, apague `BOOTSTRAP_ADMIN_PASSWORD` (ícone de lixeira) e salve. O serviço é reiniciado sem criar nada.

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
| `BOOTSTRAP_ADMIN_EMAIL` | informado no primeiro deploy | E-mail do administrador inicial |
| `BOOTSTRAP_ADMIN_PASSWORD` | informado no primeiro deploy; apagar após o primeiro acesso | Senha do administrador inicial (só é usada enquanto não houver nenhum administrador) |
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
