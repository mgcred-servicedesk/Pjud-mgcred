# Modelo de Dados — Portal Jurídico MG Cred (MVP)

| Item | Valor |
|---|---|
| Data | 14/10/2026 |
| Banco | PostgreSQL 18 (Render Postgres, região Virginia — aprovado em 14/10/2026) |
| Schema | `apps/api/src/db/schema.ts` (Drizzle) · migrações em `apps/api/drizzle/` (fonte da verdade) |
| Base | Schema SQLite de `operacional/lib/database.mjs` e regras de `operacional/server.mjs` |
| Validação | 22 testes de integração em `apps/api/test/` contra PostgreSQL 16 e 18 |

## 1. Decisões

| # | Tema | Decisão | Efeito no modelo |
|---|---|---|---|
| 1 | Empresa | Uma única empresa (MG Cred) | Sem tabela `organizations` nem `organization_id`; e-mail, código da demanda e número do processo são únicos no sistema todo |
| 2 | Mensagem interna | Sim | `request_messages.is_internal`; só quem tem `messages.internal` lê e escreve |
| 3 | Visibilidade de processos | Por usuário **e** por setor, além de "todos" | `case_access` (usuário ou setor) + `cases.client_visible` |
| 4 | Perfis | Configuráveis | `roles`, `permissions`, `role_permissions`; os dois perfis atuais vêm nos dados iniciais |
| 5 | Escopo | Paridade com o MVP atual | Só o que existe hoje, mais as decisões 2–4 e as correções estruturais |

Correções estruturais em relação ao SQLite (não mudam o funcionamento):
- Chave `uuid` em todas as tabelas; o código `JUR-AAAA-NNN` passa a ser a coluna `requests.code`, com `UNIQUE`.
- Datas em `timestamptz` / `date`; "sem valor" é `NULL`, não string vazia.
- Setor deixa de ser texto livre: tabela `departments`.
- Categorias em tabela (`request_categories`), com `is_governance` no lugar do filtro fixo "Compliance/LGPD".
- Status, prioridade e risco como `ENUM` (o código depende desses valores).
- Valor da causa em `numeric(15,2)`.
- Anexos: metadados em `documents`; conteúdo em `document_contents` (bytea, chave `storage_key`) enquanto não houver S3. A troca para S3 é uma nova implementação de `apps/api/src/services/storage.ts`, sem mudar `documents`.
- Auditoria somente inclusão por *trigger* (UPDATE, DELETE e TRUNCATE bloqueados).

## 2. Relacionamentos

```
departments ─┬─< users >── roles ─< role_permissions >── permissions
             │     ├─< sessions
             │     └─< invitations
             ├─< requests >── request_categories
             │     (solicitante, responsável → users)
             │     ├─< request_messages   (is_internal)
             │     ├─< request_access >── users
             │     ├─< documents
             │     └─< tasks
             └─< case_access >── cases      (cada linha: um usuário OU um setor)
                                   └─< tasks

request_sequences · import_batches · audit_log · rate_limits   (independentes)
```

## 3. Entidades por seção do portal

| Seção | Tabelas |
|---|---|
| Dashboard | Leitura de `requests`, `tasks`, `cases`, `audit_log` |
| Demandas | `requests`, `request_categories`, `request_sequences`, `request_access`, `request_messages`, `documents` |
| Processos | `cases`, `case_access`, `import_batches` |
| Tarefas / Prazos | `tasks` |
| Documentos | `documents` (anexos das demandas acessíveis) |
| Relatórios | Agregações sobre `requests` e `cases` |
| Compliance & LGPD | `requests` com categoria `is_governance = true` |
| Administração | `users`, `departments`, `roles`, `permissions`, `invitations`, `audit_log` |
| Minha conta | `users.password_hash`, `sessions` |

## 4. Perfis e permissões

| Permissão | Administrador Jurídico | Usuário MG Cred |
|---|:-:|:-:|
| `requests.create` | ✔ | ✔ |
| `requests.view_all` | ✔ | |
| `requests.manage` (status, prioridade, responsável; pode ser responsável) | ✔ | |
| `requests.share` | ✔ | |
| `requests.set_department` | ✔ | |
| `messages.internal` | ✔ | |
| `cases.view_all` | ✔ | |
| `cases.manage` | ✔ | |
| `cases.import` | ✔ | |
| `tasks.view_all` | ✔ | |
| `tasks.manage` | ✔ | |
| `users.manage` | ✔ | |
| `audit.view` | ✔ | |

Novos perfis (ex.: Advogado sem `users.manage`; Diretoria só leitura) são combinações dessas permissões, sem alteração de código. Perfis `is_system` não podem ser excluídos.

## 5. Regras de visibilidade (sempre aplicadas no servidor)

**Demanda:** visível se o usuário
- tem `requests.view_all`, **ou**
- é o solicitante (`requester_id`), **ou**
- está em `request_access`.

**Mensagem:** só aparece se a demanda for visível. Se `is_internal = true`, exige também `messages.internal`.

**Documento:** visível se a demanda for visível.

**Processo:** visível se o usuário
- tem `cases.view_all`, **ou**
- o processo tem `client_visible = true`, **ou**
- existe `case_access` com `user_id` = usuário, **ou**
- existe `case_access` com `department_id` = setor do usuário.

```sql
-- predicado de processo visível para :user_id
EXISTS (SELECT 1 FROM users u JOIN role_permissions rp ON rp.role_id = u.role_id
        WHERE u.id = :user_id AND rp.permission_code = 'cases.view_all')
OR c.client_visible
OR EXISTS (SELECT 1 FROM case_access a JOIN users u ON u.id = :user_id
           WHERE a.case_id = c.id AND (a.user_id = u.id OR a.department_id = u.department_id))
```

**Tarefa:** visível se o usuário tem `tasks.view_all`, **ou** é o responsável (`assignee_id`) e tem acesso à demanda e ao processo vinculados.

## 6. Regras de negócio guardadas no modelo

| Regra | Onde |
|---|---|
| Código `JUR-AAAA-NNN` gerado na mesma transação; ano no fuso `America/Sao_Paulo` | `request_sequences (prefix, year)` |
| Responsável da demanda precisa ter `requests.manage` | aplicação |
| Setor da demanda: o do solicitante na abertura; quem tem `requests.set_department` pode escolher | `requests.department_id` |
| Concorrência otimista nos registros editáveis | coluna `version` |
| Tarefa concluída ⇔ `completed_at` preenchido | `CHECK` em `tasks` |
| Acesso a processo aponta para um usuário **ou** um setor, sem duplicidade | `CHECK` + índices únicos parciais em `case_access` |
| E-mail único sem diferenciar maiúsculas | índice em `lower(email)` |
| Auditoria somente inclusão | *trigger* `audit_log_append_only` (+ `REVOKE UPDATE, DELETE` no papel da aplicação) |
| Limites de anexo (25 por demanda, cota total) | aplicação |

## 7. Correspondência com o SQLite atual

| SQLite | PostgreSQL |
|---|---|
| `organizations`, coluna `org` | removidos (empresa única) |
| `users.role` (`admin`/`client`) | `users.role_id` → `roles` |
| `users.department` (texto) | `users.department_id` → `departments` |
| `users.password` | `users.password_hash` |
| `sessions`, `invitations`, `rates` | `sessions`, `invitations` (`used` → `used_at`), `rate_limits` |
| `sequences(year)` | `request_sequences(prefix, year)` |
| `requests.id` = código | `requests.id` (uuid) + `requests.code` |
| `requests.category` / `department` (texto) | `category_id` / `department_id` |
| `requests.creator` / `owner` | `requester_id` / `owner_id` |
| `request_access` | `request_access` (+ `granted_by`, `granted_at`) |
| `messages` | `request_messages` (+ `is_internal`) |
| `documents` (arquivo em disco) | `documents` (+ `storage_key`) + `document_contents` (bytea) |
| `cases.value_cents` | `cases.claim_value numeric(15,2)` |
| `cases.next_due` (texto) | `cases.next_due date` |
| — | `case_access` (usuário ou setor) |
| `tasks.done` | `tasks.status` (`pendente`/`concluida`) + `completed_at` |
| `imports` | `import_batches` (+ `file_sha256`) |
| `audit` | `audit_log` (`entity_id uuid`, `details jsonb`) |

## 8. Fora deste escopo (fases seguintes)

Mudanças previstas que o modelo acomoda sem refazer tabelas:

| Requisito | Mudança prevista |
|---|---|
| RF-DEM-02 prefixo por categoria | `request_categories.code_prefix`; `request_sequences` já tem `prefix` |
| RF-DEM-04 / RF-DEM-08 justificativa e SLA | tabela `request_status_changes`; `first_response_at`, `closed_at` |
| RF-PRO-03 fases controladas | tabela `case_phases`; `cases.phase` → `phase_id` |
| RF-PRO-04 / RF-DOC anexos em processo e tarefa | `documents.case_id`, `task_id` + `CHECK num_nonnulls(...) = 1` |
| RF-PRO-05 andamentos e vários prazos | `case_movements`; prazos como tarefas com `case_id`, substituindo `next_due` |
| RF-PRO-08 probabilidade de perda | `cases.loss_probability` |
| RF-TAR-02/03/08 setor, status, prazo fatal | `tasks.department_id`; novos valores em `task_status` (`ALTER TYPE ... ADD VALUE`); `deadline_type` |
| RF-DOC-03/06/07 tipo, antivírus, exclusão | `document_types`; `scan_status`; `deleted_at` |
| RF-PRO-06 importação com atualização | `import_batches.inserted_rows`, `updated_rows`, `errors` |

## 9. Pontos em aberto

- O MVP chegou a ter dados reais? Se sim, é preciso um script de migração SQLite → PostgreSQL seguindo a seção 7.
