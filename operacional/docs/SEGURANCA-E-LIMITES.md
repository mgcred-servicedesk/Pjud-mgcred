# Controles implementados e limites

## Implementados

- Senhas com scrypt (N=131072, r=8, p=1), sal aleatório e comparação de tempo constante.
- Sessão opaca: o navegador recebe um token aleatório; o banco guarda apenas seu hash.
- Cookie HttpOnly e SameSite=Strict; Secure e prefixo __Host- em produção.
- Expiração de 8 horas e inatividade de 30 minutos, verificada no servidor.
- Verificação de origem e token CSRF nas alterações autenticadas.
- Limitação de tentativas de login por origem IP e conta, e limite de trabalho criptográfico concorrente.
- Convites de 24 horas, armazenados por hash, uso único e invalidação de sessões após redefinição de senha.
- Autorização no servidor para registros, mensagens, tarefas e downloads.
- Consultas parametrizadas, validação de campos, limites de upload e nomes de arquivos sem caminhos.
- Arquivos fora da pasta pública, identificadores aleatórios, download como anexo e hash de integridade.
- CSP restritiva, bloqueio de embedding, MIME sniffing desativado, não cachear páginas e respostas.
- Auditoria de autenticação, usuários, solicitações, mensagens, arquivos, tarefas, processos e importações.
- Auditoria bloqueada contra UPDATE/DELETE pela aplicação. Um administrador com acesso direto ao servidor/banco ainda pode modificar arquivos: não é trilha imutável externa.
- Sem cadastro público, senha padrão, segredo embutido ou dados de clientes no pacote.

## Limites explícitos

- Sem SSO ou MFA nesta versão. A TI deve avaliar a política da empresa antes da exposição operacional; acesso por VPN ou proxy corporativo autenticado pode ser exigido.
- Sem antivírus integrado. Extensão, tamanho e assinatura inicial são verificados, mas isso não garante ausência de malware. Downloads devem passar pelos controles de endpoint da empresa; serviços de varredura/quarentena exigem integração adicional.
- Documentos e banco dependem de criptografia de disco e backup da infraestrutura para proteção em repouso.
- Recuperação de senha tem mediação do administrador; não há envio automático de e-mail ou serviço de notificações.
- Backend é de uma organização e uma instância; não é multiempresa nem alta disponibilidade.
- Primeira versão do banco é criada automaticamente. Migrações futuras precisam de versionamento e teste próprio.
- Retenção/exclusão de conteúdo jurídico não é automatizada. Solicitações podem ser arquivadas; exclusão definitiva exige política e implementação aprovadas.
- Não há promessa de conformidade jurídica ou certificação de segurança. A TI e os responsáveis precisam homologar o ambiente e suas políticas.

## Referências técnicas

- https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- https://nodejs.org/download/release/latest-v24.x/docs/api/sqlite.html
- https://caddyserver.com/docs/automatic-https
- https://docs.docker.com/compose/
