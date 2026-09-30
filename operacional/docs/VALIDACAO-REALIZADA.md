# Validação realizada

# Parte 1: 22/09/2026 (computador Windows, sem Docker)

Ambiente: Windows, Node.js 24.13.0, SQLite nativo do Node, bancos temporários de teste, dados fictícios.

## Resultado automatizado

Comando: `node --test --test-concurrency=1 test/portal.test.mjs`

**17 testes passaram, 0 falhas.**

1. Arquivos públicos acessíveis; banco, anexos e API protegidos.
2. Origem incorreta e CSRF inválido recusam alterações.
3. Criação persistente sem falsificação de solicitante/setor pelo cliente.
4. Usuário de outra conta não acessa lista, detalhe ou mensagens privadas.
5. Status restrito ao administrador e conflito de versão detectado.
6. Mensagens e histórico persistem; alteração direta de auditoria pela aplicação recusada.
7. Upload verifica formato; download verifica autorização e força entrega como anexo.
8. Compartilhamento concede acesso e revogação bloqueia registros, arquivos e tarefas relacionadas.
9. Processos são internos por padrão e só aparecem ao cliente após liberação explícita.
10. CSV aceita campos com aspas e detecta formato ou data inválidos.
11. Importação tem prévia, prevenção de duplicatas e reversão integral em falha.
12. Convite de uso único e desativação de usuário invalidam o acesso conforme o fluxo.
13. Backup e restauração preservam banco e anexos e invalidam sessões restauradas.
14. Reinício do servidor preserva dados; logout invalida a sessão.
15. Expiração absoluta e por inatividade são aplicadas pelo servidor.
16. Repetidas tentativas de login são limitadas.
17. Configuração de produção exige origem HTTPS e emite cookie Secure, HttpOnly, SameSite e __Host-.

## Conferência no navegador

- Login com conta fictícia em banco isolado.
- Dashboard com identidade MG Cred e base inicialmente vazia.
- Criação da solicitação fictícia JUR-2026-001.
- Gravação de uma resposta e do histórico.
- Recarregamento completo com manutenção da sessão e do registro.
- Listagem de demandas e ausência de erros JavaScript observados nessa execução.

## Não validado nesse computador (22/09/2026)

Docker não está instalado neste ambiente. Não foi executado build da imagem nem `docker compose up`. A emissão/renovação do certificado, DNS, proxy de produção, volumes Linux, execução agendada/rotação de backups e alertas devem ser conferidos no servidor de destino.

Não foi realizado pentest independente, teste de carga, integração SSO/MFA, varredura antivírus de documentos ou auditoria de conformidade. Estes controles não devem ser presumidos a partir da suíte local.

Os bancos e arquivos utilizados pelos testes são temporários e não fazem parte do pacote operacional.

# Parte 2: 28/09/2026 (ambiente Linux de testes, com Docker)

Ambiente: Linux, Node.js 24.13.0, Docker Engine 29.4.3, Docker Compose 5.1.3, Caddy 2.10.2. Dados fictícios em volumes descartáveis.

## Correção aplicada

**Anexos entre cerca de 3,5 MB e 5 MB falhavam com erro 500**, embora o limite anunciado seja 5 MB. A validação do conteúdo base64 usava uma expressão regular que estourava a pilha do Node acima desse tamanho. A validação foi substituída por verificação linear com conferência de ida e volta (`server.mjs`). Os testes anteriores usavam apenas anexos pequenos e não detectavam o problema.

Ajuste menor: `scripts/admin.mjs` passou a exibir mensagem de erro legível (por exemplo, "Já existe administrador") em vez de rastro técnico.

## Resultado automatizado

Comando: `npm test`. **18 testes passaram, 0 falhas.** Os 17 originais e o novo teste 18: anexo próximo de 5 MB aceito e baixado íntegro; acima de 5 MB e base64 malformado recusados com erro 400.

## Docker Compose

O Docker Hub não era acessível nesse ambiente. Para validar o Compose, foram usadas imagens-base locais equivalentes: o mesmo binário Node.js 24.13.0 no lugar de `node:24-bookworm-slim` e o binário oficial do Caddy 2.10.2 no lugar de `caddy:2-alpine`. O `Dockerfile`, o `compose.yaml` e o `Caddyfile` foram usados sem alteração. **O build com as imagens oficiais (`docker compose build --pull`) continua a ser feito pela TI no servidor.**

Validado:

1. `docker compose config --quiet` e `caddy validate` sem erros.
2. Build da imagem e subida de app, backup e Caddy; app e backup com status healthy.
3. Execução com sistema de arquivos somente leitura, sem capacidades, usuário sem privilégios (UID 1000) e volume de dados montado somente leitura no serviço de backup.
4. Criação do primeiro administrador por `docker compose exec app node scripts/admin.mjs`; segunda criação recusada sem `--recover`.
5. Fluxo pela API em modo produção: ativação, login com cookie `__Host-` Secure, HSTS, cadastro de cliente com link HTTPS, solicitação, anexo PDF, download, processo interno invisível ao cliente, mensagem, tarefa, auditoria.
6. Caddy com `DOMAIN=localhost` (certificado interno do Caddy): HTTP redireciona para HTTPS (308), cabeçalhos de segurança presentes, porta 4320 não exposta, banco inacessível pela web, upload de ~5 MB aceito pelo proxy após a correção.
7. Backup manual (`exec app node scripts/backup.mjs`), backup ao iniciar o serviço e `last-success.json` atualizado.
8. Rotação: com `KEEP_BACKUPS=2`, após execuções sucessivas permaneceram somente os 2 backups completos mais recentes.
9. Recriação dos containers (`down` sem `-v` e `up`): dados e anexos preservados.
10. Restauração: `docker compose cp app:/backups`, `restore.mjs` para volume novo, ajuste de proprietário para UID 1000 e app iniciado sobre o volume restaurado com healthz OK, dados presentes, sessões e convites zerados.

Observação: os backups manuais seguem a mesma nomenclatura e entram na rotação. Após 14 backups mais novos, também são removidos. Para guardar um backup antes de atualização por prazo maior, copie-o para fora do volume.

## Conferência no navegador (Chromium, via Caddy/HTTPS)

- Login de administrador, dashboard com identidade MG Cred.
- Criação de solicitação LGPD, anexo pela interface, mensagem e persistência após recarregar.
- Login de cliente em tela de celular (390 px): não vê processo interno, não vê solicitação alheia, Administração exibe "Acesso restrito".
- Nenhum erro JavaScript. Aparecem apenas respostas 401 esperadas na checagem de sessão antes do login.
- Observação cosmética: no celular, o botão "Sair" quebra para a linha seguinte do cabeçalho.

## Continua pendente

DNS e certificado real (ACME/Let's Encrypt) no domínio definitivo, build com imagens oficiais, execução agendada de 24 horas por período prolongado, cópia externa criptografada dos backups e alertas. Pentest, teste de carga e auditoria de conformidade não foram realizados.
