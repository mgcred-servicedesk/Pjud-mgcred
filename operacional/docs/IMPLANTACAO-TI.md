# Implantação pela TI — Jurídico MG Cred

## 1. Ambiente de destino

Arquitetura do pacote: navegador → Caddy/HTTPS → Node.js 24 → SQLite e diretório privado de anexos. O processo Node roda sem privilégios de administrador. Apenas as portas 80 e 443 do Caddy são expostas pelo Compose. O servidor da aplicação e os documentos não são publicados diretamente.

Sugestão inicial para piloto: Linux atualizado, 2 vCPUs, 2 GB RAM e disco persistente com espaço suficiente para dados e 14 backups completos. O limite inicial de anexos é 2 GB; os backups completos precisam de capacidade adicional. Escalone após medir o uso. Não é uma garantia de capacidade para qualquer carga.

Docker Engine e Docker Compose devem estar instalados. Firewall: 80/443 para o portal e SSH restrito à TI. Configure criptografia do volume/servidor e atualizações de segurança conforme o padrão da empresa.

## 2. Domínio e configuração

1. Extraia o ZIP em uma pasta de aplicação do servidor, por exemplo `/opt/mgcred-juridico`.
2. Crie um registro DNS A (e AAAA somente se IPv6 estiver operacional) apontando o subdomínio aprovado para esse servidor.
3. Copie `.env.example` para `.env`.
4. Altere `DOMAIN` para o domínio real, sem `https://`, porta ou barra. Altere `ACME_EMAIL` para o e-mail técnico responsável.

O Compose define `APP_ORIGIN=https://DOMAIN`, `NODE_ENV=production` e as pastas de dados automaticamente. As linhas de desenvolvimento da `.env.example` servem para execução local; não alteram essas definições explícitas do Compose.

```sh
cp .env.example .env
# Edite DOMAIN e ACME_EMAIL no arquivo .env.
docker compose config --quiet
docker compose build --pull
docker compose up -d
docker compose ps
```

O Caddy obtém e renova o certificado automaticamente se o domínio apontar para o servidor e 80/443 estiverem acessíveis. Em ambiente com proxy corporativo ou balanceador anterior, a TI deve ajustar a terminação TLS e o encaminhamento de IP, preservando APP_ORIGIN exata. Não libere a porta 4320 diretamente na internet.

## 3. Primeiro administrador

Substitua o e-mail abaixo pelo e-mail real. Não use o endereço de exemplo como conta definitiva.

```sh
docker compose exec app node scripts/admin.mjs --email administrador@empresa.com.br --name "Administrador Jurídico"
```

O comando mostra um link pessoal válido por 24 horas. Entregue-o ao administrador por um canal seguro. Ele abre o link, define a senha e entra no portal. O link contém uma credencial temporária: não cole em chamados públicos, capturas de tela ou repositórios. No banco fica apenas seu hash.

Depois, cadastre os demais usuários em Administração. A página exibe o link de ativação de cada usuário para encaminhamento manual. Não há envio de e-mail configurado.

Recuperar o administrador, se necessário:

```sh
docker compose exec app node scripts/admin.mjs --email administrador@empresa.com.br --recover
```

## 4. Dados e permissões

- Administradores jurídicos veem e administram todos os registros.
- Usuários MG Cred veem solicitações que criaram ou que foram compartilhadas expressamente com eles.
- Cada usuário MG Cred vê apenas suas tarefas atribuídas. Tarefas relacionadas a registros aos quais perdeu acesso também deixam de aparecer.
- Processos iniciam internos. Marcar “Disponibilizar a todos os usuários ativos da MG Cred” concede acesso a todos os clientes cadastrados. Não marque essa opção em processos restritos.
- Documentos herdam o acesso da solicitação. Downloads exigem sessão válida e são registrados na auditoria.

Não há autoinscrição pública. Uma página de login acessível pela internet não permite acesso aos dados sem conta autorizada.

## 5. Importar o Excel

Em Processos → Importar CSV do Excel → Baixar modelo CSV, obtenha os cabeçalhos. Mapeie a planilha para `numero`, `assunto`, `parte`, `parte_contraria`, `tribunal`, `vara`, `fase`, `status`, `risco`, `valor`, `proximo_prazo`, `observacoes`.

`numero` e `assunto` são obrigatórios. Número deve ser texto no Excel para preservar zeros. Datas: AAAA-MM-DD. Valores: 1234.56 ou 1.234,56. Status: Ativo, Suspenso, Encerrado. Risco: Não avaliado, Baixo, Médio, Alto. Não use fórmulas nas células destinadas à importação; exporte os valores.

Salve como CSV UTF-8. Limites: 1 MB / 500 processos por lote. Valide, confira a prévia e confirme. Qualquer erro ou número duplicado impede o lote inteiro; não há importação parcial nem sobrescrita silenciosa. Todos os registros importados são inicialmente internos.

## 6. Backup e monitoramento

O serviço `backup` faz uma cópia ao iniciar e a cada 24 horas, mantendo 14 backups completos no volume `portal_backups`. Backup usa snapshot consistente do SQLite, copia apenas anexos referenciados e verifica hashes. Um diretório só é completo quando contém `COMPLETO.txt`.

```sh
docker compose logs --tail=50 app backup caddy
docker compose exec app node scripts/backup.mjs
docker compose exec backup cat /backups/last-success.json
```

Configure alerta para serviço indisponível, backup unhealthy, disco próximo do limite e erros recorrentes. O pacote não envia alertas por e-mail. O status de saúde do backup fica inadequado se não houver sucesso recente.

**Backup no mesmo servidor não protege contra perda do servidor.** A TI deve copiar os backups completos para destino externo criptografado e controlado. Para extrair uma cópia pontual:

```sh
docker compose cp app:/backups ./copias-backup
```

Essa pasta contém dados e credenciais protegidas por hash; trate-a como confidencial. Defina a retenção externa e monitore a transferência. Volume SQLite não possui criptografia própria neste pacote: proteção em repouso depende do disco/volume e dos backups da infraestrutura.

## 7. Atualização

Faça backup antes da atualização. Preserve os volumes e o arquivo `.env`. Substitua apenas o código e reconstrua:

```sh
docker compose exec app node scripts/backup.mjs
docker compose build --pull
docker compose up -d
docker compose ps
```

Nunca use `docker compose down -v` como rotina: a opção remove volumes. Teste upgrades de Node/Caddy em homologação; o uso de tags de versão maior permite atualizações e exige registro dos digests usados pela TI. O módulo SQLite do Node 24 ainda emite aviso experimental; a suíte foi executada em Node 24.13.0, e atualizações devem passar pelos testes.

## 8. Restauração

Teste primeiro em um ambiente separado. O script exige uma pasta de destino vazia e não sobrescreve o banco existente. Verifica integridade e invalida sessões e convites do backup restaurado.

```sh
node scripts/restore.mjs /caminho/backup-completo /caminho/destino-vazio
```

Exemplo validado em teste (ajuste nomes e caminhos; execute em homologação):

```sh
docker compose cp app:/backups ./copias-backup
docker volume create mgcred_restaurado
docker run --rm --user 0 -v "$PWD/copias-backup/mgcred-AAAA-MM-DDTHH-MM-SS-MMMZ":/bk:ro -v mgcred_restaurado:/restore mgcred-juridico:1.0.0 \
  sh -c 'node scripts/restore.mjs /bk /restore/dados && chown -R 1000:1000 /restore'
```

O volume resultante contém a pasta `dados` com `portal.sqlite` e `files`. Aponte `DATA_DIR` para essa pasta na cópia do Compose de homologação.

Backups manuais entram na mesma rotação de 14 cópias. Para reter um backup de pré-atualização por mais tempo, copie-o para fora do volume.

Para restaurar o Compose: pare app e backup, preserve o volume atual como contingência, prepare um novo volume e copie o conteúdo validado do destino para ele com proprietário UID/GID 1000. Configure o novo volume em uma cópia do Compose, suba em homologação e execute o roteiro de aceitação. A troca do volume de produção deve seguir o procedimento de mudança da TI. Não faça restauração com o app escrevendo no banco.

## 9. Entrega à operação

Registre domínio, responsável técnico, localização dos volumes, rotina e destino externo de backup, procedimento de recuperação, usuários administradores e canal de suporte. Complete `HOMOLOGACAO.md` antes de cadastrar informações reais.
