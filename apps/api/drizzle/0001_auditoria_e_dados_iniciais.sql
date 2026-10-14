-- Auditoria somente inclusão e dados iniciais (perfis, permissões e categorias do MVP).
CREATE FUNCTION audit_log_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log é somente inclusão';
END $$;--> statement-breakpoint
CREATE TRIGGER audit_log_no_update BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();--> statement-breakpoint
CREATE TRIGGER audit_log_no_truncate BEFORE TRUNCATE ON audit_log
  FOR EACH STATEMENT EXECUTE FUNCTION audit_log_append_only();--> statement-breakpoint
INSERT INTO permissions (code, description) VALUES
  ('requests.create',         'Abrir solicitações'),
  ('requests.view_all',       'Ver todas as solicitações'),
  ('requests.manage',         'Alterar status, prioridade e responsável; ser responsável por solicitações'),
  ('requests.share',          'Conceder e remover acesso a solicitações'),
  ('requests.set_department', 'Informar o setor ao abrir solicitação'),
  ('messages.internal',       'Ler e escrever mensagens internas do Jurídico'),
  ('cases.view_all',          'Ver todos os processos, inclusive internos'),
  ('cases.manage',            'Cadastrar, editar e liberar processos'),
  ('cases.import',            'Importar processos'),
  ('tasks.view_all',          'Ver todas as tarefas'),
  ('tasks.manage',            'Criar tarefas'),
  ('users.manage',            'Cadastrar e desativar usuários, setores e gerar links de acesso'),
  ('audit.view',              'Consultar auditoria');--> statement-breakpoint
INSERT INTO roles (code, name, description, is_system) VALUES
  ('admin_juridico', 'Administrador Jurídico', 'Acesso completo', true),
  ('usuario_mgcred', 'Usuário MG Cred', 'Abre e acompanha as próprias solicitações e as compartilhadas', true);--> statement-breakpoint
INSERT INTO role_permissions (role_id, permission_code)
  SELECT r.id, p.code FROM roles r CROSS JOIN permissions p WHERE r.code = 'admin_juridico';--> statement-breakpoint
INSERT INTO role_permissions (role_id, permission_code)
  SELECT id, 'requests.create' FROM roles WHERE code = 'usuario_mgcred';--> statement-breakpoint
INSERT INTO request_categories (name, is_governance, sort_order) VALUES
  ('Contratos', false, 1), ('Trabalhista', false, 2), ('Consumidor', false, 3), ('Cível', false, 4),
  ('Societário', false, 5), ('Compliance', true, 6), ('LGPD', true, 7), ('Notificação', false, 8),
  ('Parecer', false, 9), ('Consultivo', false, 10), ('Processo judicial', false, 11), ('Outros', false, 12);--> statement-breakpoint
INSERT INTO departments (name) VALUES ('Jurídico');
