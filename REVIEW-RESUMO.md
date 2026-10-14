# Resumo — Levantamento × Situação atual × Requisitos

Versão resumida de `REVIEW.md` (30/09/2026). Base: sistema operacional em `operacional/`, commit `31a119e`.
Prioridades: **A** = Alta · **M** = Média · **B** = Baixa. **[D]** = depende de decisão. **✔** = decidido (ver `REVIEW.md` §7.0).

---

## 1. Demandas Jurídicas

| Levantamento | Situação atual | RF |
|---|---|---|
| Lista com Solicitação, Categoria, Status, Prioridade | Existe, com busca por texto | — |
| Mudança automática de status? | **Não existe.** Nasce "Nova"; só o administrador altera | RF-DEM-01 (A) [D] |
| Numeração TIPO-ANO-ORDEM? | `JUR-AAAA-NNN` fixo para todas as categorias; ano em UTC | RF-DEM-02 (A) [D] |
| Filtrar por categoria | Só filtro por status; sem ordenação nem paginação | RF-DEM-03 (A) |
| Confirmação ao alterar status | Não existe | RF-DEM-04 (M) |
| Miniatura dos anexos | Não existe; download sempre forçado | RF-DEM-05 (M) |
| — | Não é possível editar a demanda após criada | RF-DEM-06 (M) |
| — | Sem notificação ao solicitante | RF-DEM-07 (A) |
| — | Sem medição de SLA | RF-DEM-08 (B) |

## 2. Processos

| Levantamento | Situação atual | RF |
|---|---|---|
| Colunas Processo/Assunto, Tribunal, Fase, Valor, Risco | Descrição corresponde à **demonstração**. No operacional: Processo, Tribunal/fase (juntos), Valor, Risco, Status | — |
| Janela de detalhes? | Existe. Administrador cai direto no formulário de edição; sem tarefas, documentos ou histórico | RF-PRO-01 (A) |
| Filtrar por fase; ordenar por risco/valor | Não existe | RF-PRO-02 (A) |
| — | Fase é texto livre | RF-PRO-03 (M) |
| — | Processos não aceitam anexos | RF-PRO-04 (A) |
| Como a lista é atualizada? | Manual ou CSV (só inclusão); um único "próximo prazo"; sem andamentos | RF-PRO-05 (A), RF-PRO-06 (A) |
| — | Visibilidade para a MG Cred é "todos ou ninguém" | RF-PRO-07 (M) |
| — | Risco sem classificação provável/possível/remota | RF-PRO-08 (M) |
| — | Sem integração com tribunais | RF-PRO-09 (B) |

## 3. Tarefas / Prazos

| Levantamento | Situação atual | RF |
|---|---|---|
| Onde serão criadas? | Só pelo administrador, na página Tarefas | RF-TAR-01 (A) |
| Atribuição a setor/pessoa | Apenas pessoa | RF-TAR-02 (M) |
| Status da tarefa | Apenas pendente/concluída | RF-TAR-03 (A) |
| — | Não é possível editar, reatribuir ou cancelar | RF-TAR-04 (A) |
| Exibição lista/kanban | Apenas lista | RF-TAR-05 (M) |
| — | "Prazos próximos" ignora prazos de processos | RF-TAR-06 (A) |
| — | Sem alertas de vencimento | RF-TAR-07 (A) |
| — | Sem distinção prazo fatal × interno | RF-TAR-08 (M) |

## 4. Documentos

| Levantamento | Situação atual | RF |
|---|---|---|
| Sem filtros ou segmentação | Confirmado: sem filtro, busca ou ordenação | RF-DOC-01 (A) |
| — | Não mostra data, autor nem categoria | RF-DOC-02 (A) |
| Filtro por tipo/categoria | Sem classificação de documento | RF-DOC-03 (M) |
| — | Limite de 5 MB; 7 formatos | RF-DOC-04 (A) [D] |
| — | Upload em base64 via JSON | RF-DOC-05 (A) |
| — | Sem antivírus | RF-DOC-06 (M) |
| — | Sem versão nem exclusão | RF-DOC-07 (M) |
| — | Sem pré-visualização | RF-DOC-08 (M) |

## 5. Relatórios executivos

| Levantamento | Situação atual | RF |
|---|---|---|
| Quadros de demanda, situação e risco | Existem, calculados no navegador sobre no máximo 1.000 registros | RF-REL-01 (A) |
| Exportação Excel? | **Não existe** | RF-REL-02 (A) |
| Exportação PDF? | **Não existe** | RF-REL-03 (A) |
| — | Sem filtro de período, setor ou responsável | RF-REL-04 (A) |
| — | Poucos indicadores (sem tempo médio, evolução, vencidos) | RF-REL-05 (M) |
| — | Sem envio agendado | RF-REL-06 (B) |

## 6. Governança › Compliance & LGPD

| Levantamento | Situação atual | RF |
|---|---|---|
| Lista de 4 colunas igual a Demandas | Confirmado: é Demandas filtrada por Compliance e LGPD | RF-GOV-01 (A) |
| — | Sem solicitações de titulares (art. 18) | RF-GOV-02 (M) [D] |
| — | Sem registro de incidentes | RF-GOV-03 (M) [D] |
| — | Sem ROPA nem gestão de políticas | RF-GOV-04 (B) [D] |
| — | Sem canal de denúncias | RF-GOV-05 (B) |

## 7. Administração

| Levantamento | Situação atual | RF |
|---|---|---|
| Usuários | Cadastro, link de ativação exibido na tela, desativação. **Não edita** usuário | RF-ADM-01 (A) |
| Perfis | Apenas Administrador Jurídico e Usuário MG Cred | RF-ADM-02 (A) [D] |
| — | Categorias, fases e setores fixos no código | RF-ADM-03 (M) |
| — | Não envia e-mail (convite e recuperação manuais) | RF-ADM-04 (A) |
| Logs | Auditoria de 100 em 100, sem filtros nem exportação | RF-ADM-05 (M) |
| Movimentações | Apenas as 5 últimas no dashboard; demais só na auditoria | RF-ADM-05 (M) |
| — | Sem painel de saúde (armazenamento, último backup) | RF-ADM-06 (B) |

---

## Transversais

| Tema | Situação atual | Necessário |
|---|---|---|
| Linguagem | JavaScript puro, sem tipagem | **TypeScript** (React + Node) |
| Front-end | HTML montado por strings | **React** ✔ |
| Banco | SQLite experimental, sem migrações | **PostgreSQL (Amazon RDS)** com migrações ✔ |
| Hospedagem | Docker Compose, não publicado | **AWS São Paulo (`sa-east-1`)** ✔ — serviço do container [D] |
| Anexos | Disco local, 5 MB, base64 | **Amazon S3 (`sa-east-1`)**, URL assinada, multipart, antivírus ✔ |
| Excel | Importa CSV (só processos, só inclusão); não exporta | Importar e exportar **XLSX** |
| E-mail | Inexistente | **Fora da primeira versão** ✔. Futuro: Brevo ou Amazon SES (a Brevo guarda os dados na UE; avaliar LGPD) [D] |
| Login | Próprio, sem MFA | **Login próprio; administrador cria o usuário e entrega o link manualmente** ✔ (igual ao MVP); MFA para administradores [D] |
| Carga | — | ~150 usuários, uso baixo; administradores com uso alto ✔ |
| Backup | Só no mesmo servidor | Backup externo criptografado |

## Contagem de RFs por prioridade

| Módulo | A | M | B | Total |
|---|---|---|---|---|
| Demandas | 4 | 3 | 1 | 8 |
| Processos | 5 | 3 | 1 | 9 |
| Tarefas | 5 | 3 | 0 | 8 |
| Documentos | 4 | 4 | 0 | 8 |
| Relatórios | 4 | 1 | 1 | 6 |
| Governança | 1 | 2 | 2 | 5 |
| Administração | 3 | 2 | 1 | 6 |
| **Total** | **26** | **18** | **6** | **50** |
