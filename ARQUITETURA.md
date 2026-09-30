# Jurídico MG Cred — estado e próximo incremento

## Atualização em 22/09/2026 — pacote operacional

Foi implementado um MVP portátil em `operacional/`, com Node.js 24, SQLite, sessões no servidor, convites de ativação, permissões por solicitação, mensagens, anexos protegidos, processos, importação CSV, tarefas, auditoria e backup/restauração. A identidade visual foi preservada. A arquitetura portátil é distinta da proposta anterior D1/R2 e pode ser instalada pela TI com Docker Compose; não foi implantada no endereço público da demonstração.

Documentação atual: `operacional/LEIA-PRIMEIRO.md`, `operacional/docs/IMPLANTACAO-TI.md` e `operacional/docs/VALIDACAO-REALIZADA.md`. Foram aprovados 17 testes automatizados locais e conferidos os fluxos básicos no navegador. Infraestrutura Docker/HTTPS/DNS, política de acesso, backup externo e homologação no destino ainda são etapas da TI. As seções abaixo registram o estado da demonstração anterior.

## Avaliação em 21/09/2026

Após a primeira implementação, o usuário forneceu index.html e README.txt do protótipo original. Ambos foram preservados sem alterações em original/. O HTML original contém a Home estática, um modal e alertas simulados; o menu e a busca não possuem navegação ou pesquisa. Não contém login, banco ou envio real de solicitações.

A versão funcional foi reconciliada com essa referência: sidebar em gradiente navy, marca textual MG CRED, busca no topo, cards na ordem original, prioridades à esquerda, acesso rápido e pendências à direita, movimentações e Compliance/LGPD na segunda linha. A busca e os atalhos agora funcionam. Os indicadores permanecem calculados a partir dos registros fictícios existentes, em vez de copiar números fixos sem correspondência nos dados. Incidentes e políticas ainda não implementados são identificados como planejamento.

O projeto na pasta superior é o Y.O.D.A e foi preservado. Os arquivos originais não são incluídos na publicação; apenas dist é servido.

## Entregue nesta demonstração

- Dashboard com indicadores calculados, prazos, pendências, demandas e movimentações.
- Nova solicitação com validação, código sequencial, categoria, prioridade, solicitante, setor e anexos.
- Consulta, pesquisa e filtro de demandas; alteração de status e mensagens registradas em histórico.
- Anexos para download apenas durante a sessão, sem envio a servidor.
- Carteira fictícia de oito processos pesquisáveis; tarefas que podem ser concluídas e reabertas.
- Relatórios calculados por área, situação e risco; módulos de governança e administração identificam o escopo futuro.
- Interface responsiva, navegação por teclado, diálogos nativos e conteúdo inserido pelo usuário escapado antes de renderização.

Nenhum login ou controle de autorização é simulado como se fosse real. Todos os dados são fictícios. Registros e arquivos novos vivem somente na memória da aba: recarregar restaura os exemplos. O link da demonstração não sincroniza alterações entre pessoas.

## Arquitetura proposta para o MVP — sujeita à decisão estrutural

Proposta de evolução no mesmo ambiente de hospedagem: interface em TypeScript e React, API no servidor, autenticação gerenciada, banco relacional D1 e armazenamento privado R2 para documentos. A proposta evita operar um servidor próprio. Antes de vincular provedores, custos, regiões e política de acesso, confirmar a arquitetura com o responsável. Nada disso está provisionado nesta demonstração.

Manter a interface independente de um provedor por meio de serviços de domínio: demandas, processos, tarefas, documentos e relatórios. Todas as consultas e alterações devem validar a sessão, a organização e a permissão no servidor; esconder botões no navegador não concede segurança.

Modelo inicial: organizations; users; memberships (usuário, organização, papel); requests; request_messages; request_events; cases; tasks; documents; import_batches. Todos os registros de negócio têm organization_id. Documentos guardam metadados no banco e conteúdo privado no armazenamento, com downloads autorizados. Identificadores das demandas são gerados transacionalmente no servidor, por organização e ano. Eventos de auditoria registram ator e horário do servidor e não são editáveis pelo usuário comum.

Perfis: administrador jurídico e usuário MG Cred, com matriz explícita de permissões. Definir quem da empresa pode ver todas as demandas, apenas as do setor ou apenas as próprias antes de conectar informações reais. O escopo multicliente deve ser testado para impedir consulta cruzada entre organizações.

## Próximo incremento concreto

1. Confirmar provedor de identidade e regras de visibilidade entre usuários MG Cred.
2. Implantar autenticação e associação usuário/organização no servidor.
3. Migrar criação, consulta, mensagens e status das demandas para API e banco, preservando a interface.
4. Adicionar armazenamento privado com limites, validação de arquivos e downloads autenticados.
5. Mapear uma cópia anonimizada do Excel: pré-visualização, validação por linha, prevenção de duplicatas, confirmação da importação e relatório de erros. Não conectar dados reais antes dos controles de segurança.
6. Validar isolamento, permissões, auditoria, sessões, recuperação de backup e comportamento em falhas antes do piloto real.

## Ainda não implementado

Login, sessões, permissões, banco persistente, sincronização multiusuário, atribuição de responsáveis, importação Excel, CRUD completo de processos/tarefas, armazenamento protegido, notificações, backups, auditoria durável, métricas de tempo de resposta e módulos completos de Compliance/LGPD. A soma de valores por risco da demonstração não é cálculo de contingenciamento.

## Executar ou publicar

A pasta dist contém exclusivamente os arquivos públicos da demonstração e pode ser servida por hospedagem estática. O arquivo dist/index.html também funciona localmente. Não publicar a pasta superior Y.O.D.A, que contém arquivos de outros trabalhos.

Para preview: node preview.mjs. A publicação por Sites usa o identificador salvo em .openai/hosting.json. A disponibilidade e o público do site devem ser conferidos no resultado da publicação; a criação de um projeto não significa que esteja publicado.
