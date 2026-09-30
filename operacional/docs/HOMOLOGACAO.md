# Homologação antes do piloto

Responsável TI: __________________  Responsável Jurídico: __________________
Ambiente/domínio: __________________  Data: __________________

Use três contas de teste: administrador, cliente A e cliente B. Use documentos fictícios.

| Verificação | Resultado esperado | Conferido |
|---|---|---|
| Acesso HTTPS | Certificado válido e redirecionamento de HTTP | ☐ |
| Ativação inicial | Link pessoal define senha; reutilização é recusada | ☐ |
| Login e logout | Senha correta permite entrada; sair invalida sessão | ☐ |
| Criar solicitação pelo cliente A | Identificador, descrição, setor e solicitante registrados | ☐ |
| Reabrir navegador e reiniciar app | Solicitação continua disponível | ☐ |
| Conta B e URL direta da conta A | Solicitação e anexo não são acessíveis | ☐ |
| Compartilhar com B | Acesso passa a funcionar somente após compartilhamento | ☐ |
| Revogar compartilhamento | Detalhe, download e tarefa relacionada voltam a ser negados | ☐ |
| Jurídico responde e muda status | A recebe resposta; dashboard e histórico refletem alteração | ☐ |
| Alteração concorrente | Segunda gravação com versão antiga pede atualização | ☐ |
| Anexo permitido / excessivo | Arquivo válido salva e baixa; formato/tamanho inválido é recusado | ☐ |
| Processo interno | Não aparece para clientes | ☐ |
| Processo liberado | Aparece para usuários MG Cred conforme opção explícita | ☐ |
| Importar CSV | Prévia, erros por linha, lote atômico e duplicidades bloqueadas | ☐ |
| Tarefas | Responsável visualiza, conclui e pode reabrir | ☐ |
| Desativar usuário | Sessão encerrada e novo login impedido | ☐ |
| Recuperação de senha | Novo link funciona e invalida sessões anteriores ao ser usado | ☐ |
| Auditoria | Operações relevantes registradas com ator e hora | ☐ |
| Backup e restauração | Banco e documentos reaparecem no ambiente restaurado | ☐ |
| Backup externo | Cópia externa concluída e acesso restrito verificado | ☐ |
| Celular | Login, leitura e criação de solicitação utilizáveis | ☐ |
| Operação | Alertas, suporte, espaço em disco e responsáveis definidos | ☐ |

Pendências: _______________________________________________________________

Liberação do piloto: TI __________________  Jurídico __________________

O piloto inicial deve envolver poucos usuários e informações fictícias até os testes acima passarem no ambiente de destino. Testes automatizados locais não validam DNS, certificados, permissões do servidor ou backup externo.
