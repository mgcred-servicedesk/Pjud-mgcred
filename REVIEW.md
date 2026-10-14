# Relatório de Análise de Sistemas — Portal Jurídico MG Cred

| Item | Valor |
|---|---|
| Data da análise | 30/09/2026 |
| Base analisada | commit `31a119e` (versão recebida, sem alterações funcionais) |
| Origem do projeto | Elaborado pelo Jurídico da MG Cred com apoio do Codex (IA) |
| Objetivo | Avaliar o estado atual, responder às dúvidas do levantamento e definir o caminho para colocar o portal em produção, em TypeScript |
| Situação | Documento de trabalho — itens marcados como **[DECISÃO]** dependem de validação |

---

## 1. Sumário executivo

O projeto organiza as rotinas do Jurídico da MG Cred: demandas internas, processos, tarefas/prazos, documentos, relatórios, Compliance/LGPD e administração de usuários. Precisa estar disponível aos colaboradores da MG Cred com segurança adequada a informações jurídicas e dados pessoais.

Existem **três artefatos distintos** na pasta, frequentemente confundidos:

| Artefato | Pasta | O que é | Uso futuro |
|---|---|---|---|
| Protótipo original | `original/` | HTML estático com dados fixos, sem navegação real | Referência histórica apenas |
| Demonstração | `dist/` | Front-end estático; dados só na memória da aba. Publicada em `juridico-mgcred-demo.laureanoadvogados.chatgpt.site` | Descontinuar (ver R-12) |
| **Sistema operacional (MVP)** | `operacional/` | Node.js 24 + SQLite, login, permissões, persistência, anexos, importação CSV, auditoria, backup, Docker | **Base funcional e de regras de negócio para a nova versão** |

Principais conclusões:

1. **O MVP operacional funciona e tem boa base de segurança** (senhas scrypt, sessão no servidor, CSRF, CSP, auditoria somente-inclusão, autorização em cada consulta). Os 18 testes automatizados passam.
2. **A implementação diverge do plano do próprio Codex.** O `ARQUITETURA.md` propunha TypeScript + React + banco D1 + armazenamento R2 (Cloudflare). O que foi entregue é JavaScript puro, sem framework, com SQLite local e arquivos em disco.
3. **O código não é sustentável para evolução**: `server.mjs` (137 linhas, ~26 KB) e `portal.js` (71 linhas, ~33 KB) concentram tudo em linhas extremamente longas, sem tipagem, sem camadas, sem migrações de banco.
4. **Faltam requisitos centrais para produção**: exportação Excel/PDF, importação XLSX, envio de e-mail, paginação, filtros/ordenação, anexos em processos, edição de registros, notificações, backup externo e definição de hospedagem/banco.
5. **Recomendação**: reescrever em TypeScript mantendo as regras de negócio e usando os 18 testes atuais como critérios de aceitação da paridade funcional, **após** as decisões de banco, hospedagem e autenticação (seção 7).

---

## 2. Arquitetura atual (`operacional/`)

### 2.1 Visão geral

```
Navegador ──HTTPS──> Caddy (proxy/TLS) ──> Node.js 24 (server.mjs) ──> SQLite (data/portal.sqlite)
                                                                   └─> Disco (data/files/<uuid>)
Serviço de backup (container separado) ──> volume local /backups (14 cópias)
```

| Camada | Implementação atual | Observação |
|---|---|---|
| Front-end | `public/index.html` + `portal.js` (JS puro, HTML montado por template string) | Sem framework, sem build, sem tipagem; escape manual via função `esc()` |
| Back-end | `server.mjs` com roteamento manual por `if`/regex | Sem framework; todas as rotas em uma função |
| Banco | `node:sqlite` (módulo **experimental** do Node 24) | Schema criado no boot; `schema_version` fixo em 1, sem migrações |
| Arquivos | Disco local, nome UUID, hash SHA-256 | Upload em **base64 dentro de JSON** (+33% de tráfego, limite 5 MB) |
| Autenticação | Própria: e-mail + senha, convites por link | Sem SSO, sem MFA, sem e-mail |
| Infra | Dockerfile, Compose (app + backup + Caddy) | Validado com imagens equivalentes, não com as oficiais |
| Dependências | Nenhuma (somente módulos nativos do Node) | Positivo para segurança de supply chain; negativo para produtividade |

### 2.2 Modelo de dados (SQLite)

`organizations`, `users`, `sessions`, `invitations`, `rates`, `sequences`, `requests`, `request_access`, `messages`, `documents`, `cases`, `tasks`, `audit`, `imports`.

Pontos relevantes:
- `ORG = 'mgcred'` é **constante no código**: o sistema é de uma única empresa.
- `documents.request_id` é obrigatório: **anexos só existem em demandas**, não em processos ou tarefas.
- `cases.next_due` guarda **um único prazo** por processo; não há histórico de movimentações/andamentos.
- `tasks.done` é booleano: tarefa tem apenas "pendente" ou "concluída".
- Perfis: apenas `admin` (Administrador Jurídico) e `client` (Usuário MG Cred).

### 2.3 Controles de segurança existentes (manter na nova versão)

- Senha com scrypt, sal aleatório, comparação em tempo constante; frase-senha mínima de 14 caracteres.
- Token de sessão opaco (banco guarda só o hash); cookie `HttpOnly`, `SameSite=Strict`, `Secure` + prefixo `__Host-` em produção.
- Expiração absoluta de 8 h e por inatividade de 30 min.
- Verificação de `Origin` e token CSRF em toda alteração.
- Limite de tentativas de login por IP e por conta.
- Autorização no servidor em listas, detalhes, mensagens, tarefas e downloads.
- CSP restritiva, `X-Frame-Options`, `nosniff`, HSTS.
- Auditoria protegida por *triggers* contra UPDATE/DELETE.
- Upload com lista de extensões e verificação de assinatura binária (PDF, ZIP/Office, PNG, JPG).

### 2.4 Testes

`npm test` executa 18 testes de integração (`node:test`) cobrindo: proteção de arquivos, CSRF/origem, isolamento entre usuários, concorrência otimista, anexos, compartilhamento, visibilidade de processos, CSV, convites, backup/restauração, expiração de sessão, limite de tentativas e configuração de produção. **Não há testes de interface (E2E), de carga nem de segurança independente.**

---

## 3. Análise por módulo

> Em cada módulo, o bloco **Levantamento** reproduz as observações originais desta análise; em seguida constam a situação real no código, as respostas às dúvidas e os requisitos propostos.

### 3.1 Demandas Jurídicas

**Levantamento**

> Lista simples com 4 colunas cada uma com título de: solicitação; categoria; status; prioridade. Na linha de Solicitação temos o título da solicitação sendo exibido (com o número de ordem - id). Cada demanda composta por Status, anexos e histórico de mensagem.
>
> - Existe regra para mudar automaticamente o status de "Nova" para "em análise" ou outra?
> - enumeração de solicitações seguir o padrão TIPO-ANO-ORDEM (ex.: JUR-2026-025)?
>
> Desejável: Confirmação para alteração de status, thumbnail (miniatura exibida) de arquivos anexados, filtrar por Categoria.

**Situação atual**

- Lista com Solicitação (assunto + código + solicitante), Categoria, Status e Prioridade. Busca textual e filtro **somente por status**.
- Janela de detalhe com descrição, solicitante, setor, responsável, data de abertura, documentos, mensagens, histórico (auditoria) e, para o administrador, alteração de status/prioridade/responsável e compartilhamento com usuários.
- Status disponíveis: `Nova`, `Em análise`, `Aguardando Jurídico`, `Aguardando MG Cred`, `Em andamento`, `Concluída`, `Arquivada`.
- Categorias (12): Contratos, Trabalhista, Consumidor, Cível, Societário, Compliance, LGPD, Notificação, Parecer, Consultivo, Processo judicial, Outros.
- Prioridades: Normal, Alta, Urgente.
- O **responsável é atribuído automaticamente ao primeiro administrador cadastrado**.
- Não é possível editar assunto/descrição/categoria após a criação, nem excluir. "Arquivada" é o fim do ciclo.

**Respostas às dúvidas**

| Dúvida | Resposta |
|---|---|
| Mudança automática de status? | **Não existe.** Toda demanda nasce `Nova` e só muda quando o administrador altera manualmente. Mensagens não alteram status. **[DECISÃO]** definir regras (ver RF-DEM-01). |
| Padrão TIPO-ANO-ORDEM? | **Parcialmente.** O código gera `JUR-AAAA-NNN` (ex.: `JUR-2026-001`), com sequência reiniciada a cada ano, prefixo fixo `JUR` para todas as categorias. O ano é calculado em **UTC**: demandas abertas após 21h de 31/12 (horário de Brasília) recebem o ano seguinte. **[DECISÃO]** prefixo por tipo/categoria (ex.: `LGPD-2026-003`) ou único. |

**Lacunas identificadas**

- Sem filtro por categoria, prioridade, responsável, setor ou período; sem ordenação por coluna; sem paginação.
- Sem confirmação ao alterar status.
- Sem miniatura/pré-visualização: o download é sempre forçado como arquivo.
- Sem exclusão de anexos enviados por engano.
- Sem SLA/prazo de resposta nem indicador de tempo em cada status.
- Sem notificação ao solicitante quando há resposta ou mudança de status.

**Requisitos propostos**

| ID | Requisito | Prioridade |
|---|---|---|
| RF-DEM-01 | Regras de transição de status (ex.: `Nova` → `Em análise` ao primeiro acesso/resposta do Jurídico; `Aguardando MG Cred` → `Aguardando Jurídico` quando o solicitante responde) | Alta |
| RF-DEM-02 | Numeração configurável `TIPO-ANO-ORDEM`, ano no fuso `America/Sao_Paulo` | Alta |
| RF-DEM-03 | Filtros combináveis: categoria, status, prioridade, responsável, setor, período; ordenação por coluna; paginação no servidor | Alta |
| RF-DEM-04 | Confirmação antes de alterar status, com campo opcional de justificativa registrada no histórico | Média |
| RF-DEM-05 | Miniatura para imagens e primeira página de PDF; pré-visualização em janela | Média |
| RF-DEM-06 | Edição de dados da demanda pelo Jurídico, com histórico da alteração | Média |
| RF-DEM-07 | Notificação por e-mail em nova mensagem e mudança de status | Alta |
| RF-DEM-08 | Registro de SLA: tempo até primeira resposta e até conclusão | Baixa |

### 3.2 Processos

**Levantamento**

> Lista simples com 5 colunas onde temos os títulos: Processo/Assunto; Tribunal; Fase; Valor da Causa; Risco. O dado em linha de Processos/Assunto virá com o título e numeração do processo
>
> - como será atualizado a listagem?
> - exibição terá uma janela exibindo para mais detalhes (como existe em Demandas)?
>
> Desejável: clicar no processo para maiores informações, filtrar por Fase, ordenar por Risco ou valor

**Situação atual**

> As colunas descritas no levantamento correspondem à **demonstração** (`dist/`). No **sistema operacional** as colunas são: Processo (número + assunto), Tribunal / fase (na mesma coluna), Valor, Risco e Status.

- Campos: número, assunto, parte, parte contrária, tribunal, vara, fase (texto livre), status (Ativo, Suspenso, Encerrado), risco (Não avaliado, Baixo, Médio, Alto), valor da causa, próximo prazo, observações, visibilidade.
- Processos nascem **internos** (só o Jurídico vê). A opção "Disponibilizar a todos os usuários ativos da MG Cred" libera para **todos** os usuários, sem granularidade.
- Criação e edição apenas pelo administrador.

**Respostas às dúvidas**

| Dúvida | Resposta |
|---|---|
| Como a listagem é atualizada? | **Manualmente**: cadastro/edição individual pelo administrador ou importação de CSV (apenas **inclusão** de processos novos; número já existente bloqueia o lote inteiro, não atualiza). **Não há integração com tribunais** (PJe, e-SAJ, Projudi, DataJud etc.). **[DECISÃO]** necessidade de importação com atualização e/ou integração. |
| Existe janela de detalhes? | **Sim, no operacional; não, na demonstração.** Para o administrador, o clique abre direto o **formulário de edição** (não há modo leitura). Para o usuário MG Cred, abre uma ficha somente leitura. A janela não mostra tarefas vinculadas, documentos nem histórico. |

**Lacunas identificadas**

- Sem filtros (fase, tribunal, risco, status) e sem ordenação (risco, valor, prazo).
- Fase é texto livre: impede filtro confiável.
- Um único "próximo prazo": sem agenda de prazos e sem andamentos/movimentações.
- Não aceita anexos (petições, decisões, contratos).
- Sem vínculo com demandas de origem; tarefas vinculadas não aparecem na ficha.
- Visibilidade "tudo ou nada" para usuários MG Cred.
- Soma de valores por risco não é provisão contábil (CPC 25): classificação provável/possível/remota não existe.

**Requisitos propostos**

| ID | Requisito | Prioridade |
|---|---|---|
| RF-PRO-01 | Ficha de detalhes em modo leitura com abas: dados, andamentos, prazos, tarefas, documentos, histórico; botão "Editar" separado | Alta |
| RF-PRO-02 | Filtros por fase, tribunal, risco, status e responsável; ordenação por risco, valor e prazo; paginação | Alta |
| RF-PRO-03 | Fase como lista controlada (cadastro de fases) | Média |
| RF-PRO-04 | Anexos em processos, com as mesmas regras de segurança das demandas | Alta |
| RF-PRO-05 | Registro de andamentos/movimentações e múltiplos prazos por processo | Alta |
| RF-PRO-06 | Importação XLSX com modo "incluir e atualizar" e relatório de diferenças antes da confirmação | Alta |
| RF-PRO-07 | Visibilidade por usuário/setor, não apenas "todos" | Média |
| RF-PRO-08 | Classificação de probabilidade de perda (provável/possível/remota) para relatórios de provisão | Média |
| RF-PRO-09 | Integração com consulta processual (ex.: API pública DataJud/CNJ) | Baixa — estudo de viabilidade |

### 3.3 Tarefas / Prazos

**Levantamento**

> Lista simples com agenda de providências para as demandas do jurídico
>
> - Onde serão criadas as tarefas?
>
> Desejável: Identificação de atribuição de tarefas (setor/Pessoa), status da tarefa, modo de exibição (lista/kanban).

**Situação atual**

- Criadas **somente pelo administrador**, no botão "+ Nova tarefa" da página Tarefas/Prazos.
- Campos: título, descrição, prazo (obrigatório), prioridade, responsável (**uma pessoa**; não há atribuição a setor), demanda relacionada e processo relacionado (opcionais).
- Situação: apenas pendente/concluída (caixa de seleção). O responsável pode concluir e reabrir.
- Não é possível editar, reatribuir ou excluir uma tarefa após criada.
- O usuário MG Cred vê apenas as tarefas atribuídas a ele.
- O indicador "Prazos próximos" do dashboard considera tarefas nos próximos 7 dias; **ignora o "próximo prazo" dos processos**.

**Respostas às dúvidas**

| Dúvida | Resposta |
|---|---|
| Onde serão criadas? | Hoje, só na página Tarefas/Prazos. Não é possível criar a partir da demanda ou do processo. Proposta: criar também dentro da ficha da demanda e do processo, já vinculada (RF-TAR-01). |

**Requisitos propostos**

| ID | Requisito | Prioridade |
|---|---|---|
| RF-TAR-01 | Criar tarefa a partir da demanda e do processo, com vínculo automático | Alta |
| RF-TAR-02 | Atribuição a pessoa **e/ou** setor | Média |
| RF-TAR-03 | Status: A fazer, Em andamento, Aguardando, Concluída, Cancelada | Alta |
| RF-TAR-04 | Edição, reatribuição e cancelamento, com histórico | Alta |
| RF-TAR-05 | Visualização em lista, kanban (por status) e calendário (por prazo) | Média |
| RF-TAR-06 | Unificar prazos de processos e tarefas no painel e em "Prazos próximos" | Alta |
| RF-TAR-07 | Alertas por e-mail: prazo em D-3, D-1 e vencido | Alta |
| RF-TAR-08 | Diferenciar prazo fatal (judicial) de prazo interno | Média |

### 3.4 Documentos

**Levantamento**

> Sessão onde ficam listados os anexos de todas as demandas solicitadas.  Um ponto na aplicação é que não há filtros ou segmentação (categoria)
>
> Desejável: Filtros para localização dos arquivos mais focado, seja por tipo, demanda ou categoria.

**Situação atual**

- Lista consolidada dos anexos das demandas que o usuário pode acessar: Arquivo, Solicitação, Tamanho, Baixar. Confirmado: **sem filtros, busca ou ordenação**.
- Não exibe data de envio, autor nem categoria da demanda (os dados existem no banco).
- Formatos aceitos: PDF, DOCX, XLSX, TXT, CSV, PNG, JPG. Limites: 5 MB por arquivo, 25 por demanda, 2 GB no total.
- Não aceita DOC, XLS, ODT, MSG/EML (e-mails), ZIP, áudio/vídeo.
- Sem antivírus, sem versionamento, sem exclusão.

**Requisitos propostos**

| ID | Requisito | Prioridade |
|---|---|---|
| RF-DOC-01 | Filtros por tipo de arquivo, demanda, processo, categoria, autor e período; busca por nome | Alta |
| RF-DOC-02 | Colunas: data, autor, origem (demanda/processo), categoria | Alta |
| RF-DOC-03 | Classificação do documento (ex.: contrato, petição, procuração, parecer, notificação) | Média |
| RF-DOC-04 | Revisar limites de tamanho e formatos com o Jurídico (ex.: PDFs de processos costumam passar de 5 MB) | Alta |
| RF-DOC-05 | Upload multipart/streaming direto para armazenamento de objetos (sem base64) | Alta |
| RF-DOC-06 | Varredura antivírus antes de liberar o download | Média |
| RF-DOC-07 | Versionamento e exclusão lógica com trilha de auditoria | Média |
| RF-DOC-08 | Pré-visualização e miniaturas (ver RF-DEM-05) | Média |

### 3.5 Relatórios executivos

**Levantamento**

> Resumo geral das demandas, prazos, processos e status de tudo que acontece no âmbito jurídico. Quadros simplificados de demanda, situação e risco.
>
> - terá exportação desses relatórios (PDF, Excel)?

**Situação atual**

- Indicadores do painel (demandas abertas, prazos próximos, processos ativos, aguardando MG Cred), barras de demandas por categoria e quantidade/valor por risco.
- Os cálculos são feitos **no navegador**, a partir de no máximo 1.000 registros carregados por módulo.
- Sem filtro de período, setor ou responsável.

**Resposta à dúvida**

| Dúvida | Resposta |
|---|---|
| Exportação PDF/Excel? | **Não existe nenhuma exportação.** A única saída de arquivo é o modelo CSV vazio de importação. É requisito obrigatório desta fase (RF-REL-02/03). |

**Requisitos propostos**

| ID | Requisito | Prioridade |
|---|---|---|
| RF-REL-01 | Cálculo dos indicadores no servidor (agregações no banco), sem limite de 1.000 registros | Alta |
| RF-REL-02 | Exportação **Excel (XLSX)** das listas (demandas, processos, tarefas, documentos) com os filtros aplicados | Alta |
| RF-REL-03 | Exportação **PDF** do relatório executivo com identidade MG Cred | Alta |
| RF-REL-04 | Filtros por período, categoria, setor, responsável | Alta |
| RF-REL-05 | Novos indicadores: tempo médio de atendimento, demandas por setor solicitante, evolução mensal, prazos vencidos, contingência por probabilidade de perda | Média |
| RF-REL-06 | Envio agendado do relatório (ex.: mensal) por e-mail | Baixa |

### 3.6 Governança › Compliance & LGPD

**Levantamento**

> Demandas focadas em Compliance e LGPD da empresa com a lista de 4 colunas que encontramos em Demandas na sessão juriídico do menu.

**Situação atual**

- Confirmado: é a mesma tabela de Demandas, filtrada pelas categorias `Compliance` e `LGPD`. A própria interface informa que a gestão especializada (incidentes, denúncias, registro de tratamento) exige incremento posterior.

**Requisitos propostos**

| ID | Requisito | Prioridade |
|---|---|---|
| RF-GOV-01 | Manter a visão filtrada, com os mesmos filtros/exportações de Demandas | Alta |
| RF-GOV-02 | Registro de solicitações de titulares de dados (art. 18 LGPD) com prazo de resposta | Média — **[DECISÃO]** escopo |
| RF-GOV-03 | Registro de incidentes de segurança/vazamento com avaliação de comunicação à ANPD | Média — **[DECISÃO]** escopo |
| RF-GOV-04 | Registro das operações de tratamento (ROPA) e gestão de políticas com versão e aceite | Baixa — **[DECISÃO]** escopo |
| RF-GOV-05 | Canal de denúncias com anonimato | Baixa — requer desenho próprio de segurança |

### 3.7 Administração

**Levantamento**

> menu voltado para administrador, administrando movimentações, usuários, perfis, logs, etc.

**Situação atual**

- Usuários: cadastro (nome, e-mail, setor, perfil), geração de link de ativação/recuperação exibido na tela (**não envia e-mail**), desativação/reativação.
- **Não é possível editar** nome, e-mail, setor ou perfil depois do cadastro.
- Perfis fixos: Administrador Jurídico (acesso total) e Usuário MG Cred.
- Auditoria: lista de 100 eventos por página, sem filtros nem exportação.
- "Movimentações" aparecem apenas no dashboard (últimas 5 de demandas).

**Requisitos propostos**

| ID | Requisito | Prioridade |
|---|---|---|
| RF-ADM-01 | Edição de usuários (nome, setor, perfil) com auditoria | Alta |
| RF-ADM-02 | Perfis adicionais: ex. Advogado/Analista jurídico (sem administrar usuários), Gestor de setor (vê demandas do setor), Leitura/Diretoria (relatórios) | Alta — **[DECISÃO]** matriz de permissões |
| RF-ADM-03 | Cadastro de setores e das tabelas auxiliares (categorias, fases, tipos de documento) | Média |
| RF-ADM-04 | Envio automático de convite e recuperação de senha por e-mail | Alta |
| RF-ADM-05 | Auditoria com filtros (usuário, ação, período, registro) e exportação | Média |
| RF-ADM-06 | Painel de saúde: armazenamento usado, último backup, usuários ativos | Baixa |

### 3.8 Achados adicionais (não citados no levantamento)

| ID | Achado | Onde |
|---|---|---|
| A-01 | Em "Pendências da MG Cred" (dashboard) a prioridade exibida é sempre "Alta", independentemente da prioridade real | `portal.js`, função `dashboard()` |
| A-02 | Busca global pesquisa apenas nos registros já carregados no navegador (demandas e processos); não pesquisa tarefas, documentos nem mensagens | `portal.js`, `searchPage()` |
| A-03 | "Últimas movimentações" busca os 500 últimos eventos e só depois filtra por permissão; usuários comuns podem ver lista vazia mesmo com movimentações | `server.mjs`, `/api/state` |
| A-04 | Todo o conteúdo (demandas + anexos, processos, tarefas) é carregado em uma única chamada `/api/state`, com uma consulta extra por demanda para listar anexos | `server.mjs` |
| A-05 | No celular, o botão "Sair" quebra linha no cabeçalho (já registrado em `VALIDACAO-REALIZADA.md`) | CSS |
| A-06 | Sessão expira após 30 min sem uso; texto longo sendo digitado pode ser perdido sem aviso | `server.mjs` / `portal.js` |

---

## 4. Requisitos transversais

### 4.1 Anexos

- Armazenamento de objetos privado (S3 ou compatível), com metadados no banco e download sempre autorizado pelo servidor (URL assinada de curta duração ou *stream* pela API).
- Upload multipart com barra de progresso; limite configurável (proposta inicial: 25–50 MB por arquivo, a validar).
- Mantidas as validações atuais: lista de extensões, verificação de assinatura binária, hash SHA-256, nome sanitizado.
- Adicionar: antivírus (ex.: ClamAV), miniaturas, exclusão lógica, anexos em processos e tarefas.

### 4.2 Excel — importação e exportação

| Necessidade | Hoje | Proposto |
|---|---|---|
| Importar processos | CSV UTF-8, 500 linhas, só inclusão | **XLSX e CSV**, prévia com validação por linha, modo incluir/atualizar, relatório de erros em planilha |
| Importar outros dados | Não existe | Avaliar usuários, demandas históricas e tarefas **[DECISÃO]** |
| Exportar listas | Não existe | XLSX com filtros aplicados, cabeçalhos em português, datas e moeda formatadas |
| Exportar relatórios | Não existe | XLSX (dados) + PDF (executivo) |
| Modelo de importação | CSV vazio | XLSX com instruções, validação de listas (status, risco, fase) e exemplo |

Exportações grandes devem ser geradas no servidor com *streaming* e auditadas (quem exportou o quê), pois extraem dados sensíveis em massa.

### 4.3 Notificações

Não existe nenhum envio de e-mail. Necessário para convites, recuperação de senha, respostas em demandas, mudança de status e alertas de prazo. **[DECISÃO]** provedor (SMTP do Microsoft 365/Google Workspace da MG Cred, Amazon SES, SendGrid etc.).

### 4.4 Autenticação e acesso

- Manter a autenticação própria atual **ou** integrar SSO corporativo (OIDC — ex.: Microsoft Entra ID, se a MG Cred usa Microsoft 365). **[DECISÃO]**
- MFA recomendado para o perfil administrador, no mínimo.
- Recuperação de senha por e-mail (hoje depende do administrador copiar o link).

### 4.5 LGPD e retenção

- O sistema tratará dados pessoais de colaboradores, partes processuais e clientes. É necessário definir base legal, prazos de retenção, procedimento de exclusão/anonimização e responsável (DPO/encarregado).
- Registrar exportações e downloads na auditoria (downloads já são registrados).
- Hospedagem preferencialmente no Brasil ou com cláusulas adequadas de transferência internacional. **[DECISÃO]**

### 4.6 Requisitos não funcionais

| ID | Requisito |
|---|---|
| RNF-01 | Paginação e filtros no servidor em todas as listas |
| RNF-02 | Tempo de resposta das listas < 1 s para o volume esperado (volume a levantar) |
| RNF-03 | Backup diário automatizado **fora do servidor de aplicação**, criptografado, com restauração testada periodicamente |
| RNF-04 | Monitoramento de disponibilidade, erros e espaço; alertas para a TI |
| RNF-05 | Migrações de banco versionadas e reversíveis |
| RNF-06 | Logs estruturados sem dados pessoais ou segredos |
| RNF-07 | Responsivo (desktop e celular) e acessível (teclado, contraste, leitores de tela) |
| RNF-08 | Identidade visual MG Cred preservada (`IDENTIDADE-VISUAL.md`, `brand.css`) |
| RNF-09 | Ambientes separados: desenvolvimento, homologação e produção |
| RNF-10 | Pipeline de CI com lint, verificação de tipos e testes a cada alteração |

---

## 5. Riscos e débitos técnicos

| ID | Risco / débito | Impacto | Recomendação |
|---|---|---|---|
| R-01 | Código concentrado em 2 arquivos com linhas de milhares de caracteres, sem tipagem | Alto — manutenção lenta e propensa a erro | Reescrever em TypeScript com camadas (rotas, serviços, repositórios) |
| R-02 | `node:sqlite` é experimental no Node 24 | Médio — API pode mudar entre versões | Substituir por banco de produção com driver estável |
| R-03 | SQLite local: uma instância, sem alta disponibilidade, banco no mesmo disco da aplicação | Médio/Alto conforme criticidade | Banco gerenciado ou servidor dedicado (seção 7) |
| R-04 | Sem migrações de banco (versão fixa 1; o sistema recusa iniciar se mudar) | Alto — impede evolução segura do schema | ORM/ferramenta de migração |
| R-05 | Front-end monta HTML por concatenação de strings; segurança depende de lembrar de chamar `esc()` em cada campo | Médio — risco de XSS em evoluções | Framework com escape automático (React) |
| R-06 | Carregamento integral dos dados por usuário e limite de 1.000 registros | Médio — indicadores incorretos com crescimento | Paginação e agregações no servidor |
| R-07 | Upload em base64 via JSON | Médio — consumo de memória, limite baixo | Multipart/streaming |
| R-08 | Backup apenas no mesmo servidor | Alto — perda total se o servidor falhar | Backup externo automatizado |
| R-09 | Sem e-mail: convites e recuperação dependem de cópia manual do link | Médio — operação e segurança do canal | Provedor de e-mail transacional |
| R-10 | Sem SSO/MFA | Médio/Alto — conta comprometida expõe dados jurídicos | MFA para administradores; avaliar SSO |
| R-11 | Sem antivírus em anexos | Médio | Varredura antes do download |
| R-12 | Demonstração pública em `chatgpt.site` com a marca MG Cred, fora do controle da TI | Médio — confusão de usuários e de imagem | Retirar do ar após confirmação do Jurídico |
| R-13 | Numeração anual em UTC | Baixo — códigos com ano errado na virada do ano | Usar fuso `America/Sao_Paulo` |
| R-14 | Plano original (TypeScript/React/D1/R2) e implementação divergentes, documentação misturando os dois | Baixo — confusão de decisões | Este relatório passa a ser a referência; atualizar `ARQUITETURA.md` após as decisões |

---

## 6. Divergência com o plano original do Codex

O `ARQUITETURA.md` registra duas propostas sucessivas:

1. **Proposta inicial** (seção "Arquitetura proposta para o MVP"): TypeScript + React, API no servidor, autenticação gerenciada, banco D1 e armazenamento R2 (plataforma Cloudflare), sem servidor próprio. Nunca foi implementada.
2. **Implementação entregue** (seção "Atualização em 22/09/2026"): Node.js/JavaScript, SQLite e disco local, Docker Compose, operado pela TI.

A diretriz deste projeto é **seguir em TypeScript**, conforme a proposta inicial. As escolhas de banco e hospedagem continuam em aberto e são tratadas a seguir. O modelo de dados do plano (`organizations`, `users`, `memberships`, `requests`, `request_messages`, `request_events`, `cases`, `tasks`, `documents`, `import_batches`, todos com `organization_id`) é adequado e compatível com o que foi implementado; recomenda-se mantê-lo como referência.

---

## 7. Decisões

### 7.0 Decisões tomadas (30/09/2026)

| Tema | Decisão | Observações |
|---|---|---|
| Linguagem | TypeScript | Front-end e back-end |
| Front-end | React | — |
| Banco de dados | PostgreSQL | Gerenciado (Amazon RDS), menor faixa: 1–2 vCPU, 1–2 GB RAM, 20 GB |
| Armazenamento de arquivos | Bucket S3 | Amazon S3 em `sa-east-1`; acesso via SDK S3 (portável) |
| Hospedagem | AWS, região São Paulo (`sa-east-1`) | Dados no Brasil. Aplicação em container único (0,5–1 vCPU, 512 MB–1 GB) |
| Autenticação | Login próprio; o administrador cria o usuário e entrega o link de ativação manualmente | Mesmo fluxo do MVP (forma mais simples). Recuperação de senha também por link gerado pelo administrador |
| Envio de e-mail | **Não haverá na primeira versão** | Brevo é uma possibilidade futura, ainda não decidida. Ver ressalvas abaixo |
| Carga esperada | ~150 usuários, uso baixo; uso alto pelos administradores | Picos estimados de 10–30 usuários simultâneos; carga concentrada em exportações, importações e relatórios |

**Consequências para a implementação**

- Sessões, filas e agendamentos no PostgreSQL (ex.: pg-boss); nenhum estado em memória, para permitir uma segunda instância se necessário.
- Upload e download direto no S3 por URL assinada de curta duração, com autorização sempre validada pela API.
- Exportações e importações grandes em segundo plano; PDF com biblioteca leve em vez de navegador embutido.
- Paginação, filtros e índices no servidor para as telas de uso intenso dos administradores.
- Sem e-mail no início: RF-ADM-04, RF-DEM-07, RF-TAR-07 e RF-REL-06 ficam para uma fase posterior. O link de ativação continua exibido ao administrador, que o entrega por canal seguro. O envio deve ficar isolado atrás de uma interface no código, para ser ligado depois sem retrabalho.

**Ressalvas para quando o e-mail for adotado (ex.: Brevo)**

- Os dados da Brevo ficam na União Europeia (França, Alemanha e Bélgica). Endereços de e-mail e o conteúdo das mensagens configuram **transferência internacional** (LGPD, art. 33); avaliar com o encarregado de dados e firmar o DPA da Brevo.
- Os e-mails devem conter o mínimo necessário: aviso e link para o portal (ex.: "Nova mensagem na demanda JUR-2026-001"), sem assunto detalhado, descrição, nomes de partes ou anexos.
- Os links de convite e de recuperação são credenciais temporárias: validade curta, uso único, armazenados só como hash (como no MVP). Desativar o rastreamento de cliques da Brevo nesses e-mails, para que o link não seja reescrito nem registrado por terceiros.
- Configurar SPF, DKIM e DMARC no domínio remetente da MG Cred (depende da TI/DNS).
- Alternativa na mesma conta e região: Amazon SES em `sa-east-1`, que mantém os dados no Brasil. Isolar o envio atrás de uma interface na aplicação permite trocar de provedor sem retrabalho.

**Pendentes**

- MFA (TOTP) para administradores: recomendado, pois são as contas com acesso total e uso intenso.
- Serviço exato de execução do container na AWS (ECS Fargate ou Lightsail Containers) e estimativa de custo na calculadora AWS.
- Domínio do portal.
- Provedor de e-mail (Brevo ou Amazon SES), domínio remetente e aprovação do encarregado de dados — somente quando o envio de e-mail entrar no escopo.

> As subseções 7.1 a 7.3 registram a análise que embasou as decisões.

### 7.1 Banco de dados **[DECISÃO]**

| Opção | Prós | Contras |
|---|---|---|
| **PostgreSQL** (gerenciado ou próprio) | Padrão de mercado, concorrência real, transações robustas, busca textual, JSON, disponível como serviço gerenciado em todos os provedores, backups/PITR gerenciados | Requer serviço separado (custo/gestão) |
| SQL Server / Azure SQL | Integra bem se a MG Cred já usa ecossistema Microsoft | Licenciamento/custo; ferramentas Node menos comuns |
| Cloudflare D1 (plano original) | Serverless, baixo custo, backup integrado | Baseado em SQLite, com limites de tamanho por banco e restrições do runtime Workers; forte dependência do provedor |
| Manter SQLite | Zero infraestrutura adicional | Uma instância, sem HA, riscos R-02/R-03 |

**Recomendação da análise:** PostgreSQL, com acesso por ORM com migrações, o que mantém a aplicação portátil entre provedores.

### 7.2 Hospedagem **[DECISÃO]**

| Opção | Descrição | Prós | Contras |
|---|---|---|---|
| A. Servidor próprio/VPS com Docker Compose | Evolução do modelo atual (app + PostgreSQL + armazenamento S3 compatível + Caddy) | Controle total, custo previsível, reaproveita Compose/Caddy | TI responsável por atualizações, backup externo, monitoramento e segurança do SO |
| B. Nuvem gerenciada Microsoft Azure | Container Apps/App Service + Azure Database for PostgreSQL + Blob Storage | Integração natural com Microsoft 365/Entra ID (SSO), região Brasil, serviços gerenciados | Custo mensal maior; configuração inicial mais complexa |
| C. Nuvem gerenciada AWS | App Runner/ECS/Lightsail + RDS PostgreSQL + S3 | Maturidade, região São Paulo, S3 como padrão de armazenamento | Custo e complexidade semelhantes à opção B |
| D. Cloudflare (plano original) | Workers + D1 + R2 | Baixo custo, sem servidor, CDN global | Runtime não é Node completo (bibliotecas de Excel/PDF podem exigir adaptação); D1 com limites; dependência do provedor |

Fatores que decidem: a MG Cred usa Microsoft 365 ou Google Workspace? A TI tem equipe para operar servidor? Há exigência de dados no Brasil? Orçamento mensal? Volume de documentos esperado?

### 7.3 Outras decisões

| Tema | Pergunta |
|---|---|
| Autenticação | Manter login próprio ou usar SSO corporativo? MFA obrigatório para quem? |
| E-mail | Qual provedor/conta envia as notificações? |
| Armazenamento | Volume estimado de documentos e tamanho máximo por arquivo? |
| Multiempresa | O portal atenderá só a MG Cred ou outras empresas/clientes do escritório? (muda o modelo de acesso) |
| Repositório e CI | Onde o código ficará hospedado (GitHub, GitLab, Azure DevOps)? |
| Demonstração pública | Pode ser retirada do ar? |

---

## 8. Proposta de arquitetura alvo (TypeScript)

> Proposta para discussão. Bibliotecas indicadas são candidatas e devem ser validadas (versão, licença, manutenção) antes da adoção.

```
apps/web   → React + TypeScript + Vite (interface; identidade MG Cred)
apps/api   → Node.js 24 + TypeScript (API REST, regras de negócio, autorização)
packages/shared → tipos e esquemas de validação compartilhados entre web e api
infra/     → Docker, Compose ou IaC do provedor escolhido
```

| Camada | Candidatos | Motivo |
|---|---|---|
| Framework da API | Fastify ou NestJS | Fastify: leve e rápido. NestJS: estrutura modular com guards para perfis/permissões |
| Validação | Zod | Esquemas únicos para front e back |
| ORM / migrações | Prisma ou Drizzle | Tipagem a partir do schema e migrações versionadas (resolve R-04) |
| Front-end | React + React Router + TanStack Query + TanStack Table | Tabelas com filtro, ordenação e paginação (atende RF-DEM-03, RF-PRO-02, RF-DOC-01) |
| Excel | ExcelJS | Leitura e escrita de XLSX com estilos e *streaming* |
| PDF | Renderização HTML→PDF (Playwright/Chromium) ou pdfmake | Relatório com a identidade visual |
| Armazenamento | SDK S3 (compatível com AWS S3, R2, MinIO, e Azure via adaptador) | Isola a escolha de hospedagem |
| Miniaturas | sharp (imagens), pdf.js (primeira página de PDF) | RF-DEM-05 |
| Antivírus | ClamAV (container) | RF-DOC-06 |
| Tarefas agendadas | Fila/agendador (ex.: pg-boss sobre PostgreSQL) | Alertas de prazo, relatórios agendados |
| Testes | Vitest (unidade/integração) + Playwright (E2E) | Portar os 18 testes atuais como critérios de aceite |
| Qualidade | ESLint, Prettier, `tsc --noEmit` no CI | RNF-10 |

Princípios a preservar do MVP: autorização sempre no servidor, sessões opacas com hash, CSRF, CSP restritiva, auditoria somente-inclusão, concorrência otimista (`version`), processos internos por padrão, importação atômica com prévia.

---

## 9. Roteiro proposto

| Fase | Entregas | Pré-requisito |
|---|---|---|
| **0. Decisões e fundação** | Decisões da seção 7; matriz de permissões; regras de status e numeração; repositório remoto; estrutura TypeScript; CI | Reunião com Jurídico e TI |
| **1. Paridade funcional** | Reescrita em TypeScript de todas as funções atuais; PostgreSQL com migrações; armazenamento de objetos; upload multipart; 18 testes portados | Fase 0 |
| **2. Melhorias dos módulos** | Filtros/ordenação/paginação; ficha de processo; anexos em processos; tarefas com status, edição e kanban; documentos com filtros; confirmação de status; miniaturas; edição de usuários e perfis | Fase 1 |
| **3. Excel, relatórios e notificações** | Importação XLSX com atualização; exportação XLSX/PDF; indicadores no servidor; e-mails (convite, recuperação, respostas, prazos) | Fase 1; provedor de e-mail |
| **4. Produção** | Infraestrutura no provedor escolhido; backup externo; monitoramento; MFA; homologação (`operacional/docs/HOMOLOGACAO.md` atualizado); piloto com poucos usuários; retirada da demonstração pública | Fases 1–3 |
| **5. Governança avançada** | Módulos LGPD/Compliance especializados (RF-GOV-02 a 05), integração processual | Definição de escopo |

A migração de dados do MVP não é necessária se ele não tiver entrado em uso real; confirmar antes da Fase 1.

---

## 10. Questões para validação com o Jurídico

1. Quais transições automáticas de status são desejadas (RF-DEM-01)?
2. Numeração única `JUR-AAAA-NNN` ou prefixo por categoria/tipo?
3. Quem da MG Cred pode ver o quê: só as próprias demandas, as do setor ou todas? Gestores de setor precisam de visão ampliada?
4. Quais perfis além de "Administrador Jurídico" e "Usuário MG Cred" são necessários?
5. Qual o formato atual da planilha de processos (enviar cópia anonimizada)? A importação deve atualizar processos existentes?
6. Há necessidade de acompanhar andamentos processuais no portal ou apenas o próximo prazo?
7. Quais processos podem ser exibidos à MG Cred e a quem?
8. Quais relatórios são usados hoje (diretoria, auditoria, contabilidade)? Com que periodicidade?
9. O relatório de risco precisa seguir classificação de provisão (provável/possível/remota)?
10. Tamanho típico e formatos dos documentos (PDFs de processos, e-mails .msg, planilhas .xls antigas)?
11. Quais controles de LGPD/Compliance devem entrar no portal nesta etapa?
12. Quantos usuários e qual volume anual de demandas e processos são esperados?
13. O MVP operacional chegou a ser usado com dados reais?

---

## Anexo A — Arquivos de referência

| Arquivo | Conteúdo |
|---|---|
| `ARQUITETURA.md` | Histórico de decisões do Codex e proposta TypeScript/D1/R2 |
| `IDENTIDADE-VISUAL.md` | Cores, fonte e logotipos MG Cred |
| `CONTINUAR-EM-CASA.txt` | Estado da entrega em 28/09/2026 |
| `operacional/LEIA-PRIMEIRO.md` | Visão geral do MVP |
| `operacional/docs/IMPLANTACAO-TI.md` | Instalação, primeiro administrador, importação, backup e restauração |
| `operacional/docs/SEGURANCA-E-LIMITES.md` | Controles implementados e limites declarados |
| `operacional/docs/VALIDACAO-REALIZADA.md` | Testes executados (Windows e Linux/Docker) |
| `operacional/docs/HOMOLOGACAO.md` | Roteiro de homologação antes do piloto |
| `operacional/server.mjs` | API e regras de negócio |
| `operacional/lib/database.mjs` | Schema do banco |
| `operacional/lib/security.mjs` | Validações, senhas, listas de status/categorias/prioridades |
| `operacional/lib/csv.mjs` | Importação CSV de processos |
| `operacional/public/portal.js` | Interface do portal |
| `operacional/test/portal.test.mjs` | 18 testes de integração |

## Anexo B — Como executar o MVP localmente

Pré-requisito: Node.js 24.

```sh
cd operacional
npm test                 # 18 testes automatizados
node test/preview.mjs    # portal em http://127.0.0.1:4320 com banco temporário
                         # usuário qa@example.test / senha definida em test/preview.mjs
```

Abrir diretamente em `http://127.0.0.1:4320` (o servidor recusa alterações vindas de outra origem, inclusive de proxies de pré-visualização).
