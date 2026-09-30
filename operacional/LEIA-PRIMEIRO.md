# Jurídico MG Cred — pacote operacional

Este pacote contém uma versão funcional com servidor e dados persistentes para instalação e homologação pela TI. Ele é separado da demonstração pública em chatgpt.site. Copiar estes arquivos para uma hospedagem exclusivamente estática não instala o sistema.

## O que está pronto

- Identidade MG Cred e interface para desktop e celular.
- Login individual, senha protegida por scrypt, sessão no servidor e saída da conta.
- Cadastro de usuários, ativação por link de uso único e desativação de acesso.
- Solicitações com identificador, responsável, prioridade, status e histórico.
- Mensagens e anexos persistentes, com autorização em cada download.
- Compartilhamento de uma solicitação com usuários específicos.
- Processos, edição de acompanhamento e importação CSV UTF-8 exportado do Excel.
- Tarefas com responsável e prazo; conclusão e reabertura.
- Dashboard e relatórios calculados com os registros autorizados.
- Auditoria e proteção contra alterações concorrentes em registros.
- Docker Compose, proxy HTTPS, backup diário e restauração verificada por hashes.
- Testes automatizados de funcionamento, persistência e controle de acesso.

## Como começar

**Para a TI instalar em um servidor:** siga `docs/IMPLANTACAO-TI.md`.

**Para experimentar neste computador:** instale Node.js 24 LTS e execute `INICIAR-LOCAL.ps1` no PowerShell. O primeiro uso solicita o e-mail do administrador e gera um link para definir a senha. Nenhuma senha padrão é distribuída. O portal local fica em http://127.0.0.1:4320.

**Para conferir antes de usar:** siga `docs/HOMOLOGACAO.md`. Use dados fictícios até concluir a implantação e a homologação.

## O que a TI ainda precisa fornecer

1. Um servidor Linux com Docker Compose, armazenamento persistente e acesso de administração.
2. Um domínio ou subdomínio aprovado e o apontamento DNS. `juridico.mgcred.com.br` é apenas uma sugestão; não foi registrado nem configurado.
3. E-mail do administrador inicial e e-mail técnico para os certificados HTTPS.
4. Política de visibilidade dos processos e lista de usuários.
5. Destino externo protegido para cópia dos backups e monitoração operacional.

Não há contas, senhas de produção, chaves ou dados reais no ZIP. Os testes usam credenciais fictícias apenas em bancos temporários; elas não são criadas pelo servidor operacional. O endereço público da demonstração não foi convertido em produção.

## Escopo e limites desta versão

Este MVP é de uma única organização, MG Cred, com uma instância do servidor e banco SQLite no mesmo disco. Não execute múltiplas réplicas e não coloque o banco em pasta de sincronização, OneDrive, Dropbox, NFS ou SMB em produção. A evolução para múltiplas empresas ou múltiplos servidores exige outro incremento arquitetural.

A interface carrega até 1.000 registros por módulo e informa quando há mais. Para ampliar esse volume, implementar paginação e agregações no banco antes de usar os totais como referência gerencial.

Importação suporta CSV UTF-8, não leitura direta de XLSX. E-mail automático, SSO/Microsoft 365, MFA, integração com tribunais, assinatura eletrônica e módulos especializados de Compliance/LGPD não estão incluídos. Recuperação de senha é feita por link emitido pelo administrador, ou pela TI para recuperar o primeiro administrador.

Os testes locais não substituem a homologação da infraestrutura. Docker, DNS e emissão de certificados devem ser validados no servidor da TI.
