export const priorities = ['normal', 'alta', 'urgente'] as const;
export const requestStatuses = ['nova', 'em_analise', 'aguardando_juridico', 'aguardando_mgcred', 'em_andamento', 'concluida', 'arquivada'] as const;
export const caseStatuses = ['ativo', 'suspenso', 'encerrado'] as const;
export const caseRisks = ['nao_avaliado', 'baixo', 'medio', 'alto'] as const;
export const taskStatuses = ['pendente', 'concluida'] as const;

export type Priority = (typeof priorities)[number];
export type RequestStatus = (typeof requestStatuses)[number];
export type CaseStatus = (typeof caseStatuses)[number];
export type CaseRisk = (typeof caseRisks)[number];
export type TaskStatus = (typeof taskStatuses)[number];

export const labels: Record<string, string> = {
  normal: 'Normal', alta: 'Alta', urgente: 'Urgente',
  nova: 'Nova', em_analise: 'Em análise', aguardando_juridico: 'Aguardando Jurídico', aguardando_mgcred: 'Aguardando MG Cred',
  em_andamento: 'Em andamento', concluida: 'Concluída', arquivada: 'Arquivada',
  ativo: 'Ativo', suspenso: 'Suspenso', encerrado: 'Encerrado',
  nao_avaliado: 'Não avaliado', baixo: 'Baixo', medio: 'Médio', alto: 'Alto',
  pendente: 'Pendente',
};
export const label = (code: string) => labels[code] ?? code;

export const closedRequestStatuses: readonly RequestStatus[] = ['concluida', 'arquivada'];

export const permissions = [
  'requests.create', 'requests.view_all', 'requests.manage', 'requests.share', 'requests.set_department',
  'messages.internal', 'cases.view_all', 'cases.manage', 'cases.import',
  'tasks.view_all', 'tasks.manage', 'users.manage', 'audit.view',
] as const;
export type Permission = (typeof permissions)[number];

export const upload = {
  maxBytes: 5 * 1024 * 1024,
  maxPerRequest: 25,
  extensions: ['.pdf', '.docx', '.xlsx', '.txt', '.csv', '.png', '.jpg', '.jpeg'],
} as const;

export const importColumns = ['numero', 'assunto', 'parte', 'parte_contraria', 'tribunal', 'vara', 'fase', 'status', 'risco', 'valor', 'proximo_prazo', 'observacoes'] as const;

// ===== Contratos da API =====
export interface Named { id: string; name: string }

export interface Me {
  id: string; name: string; email: string; active: boolean;
  department: Named | null; role: { id: string; code: string; name: string };
  permissions: Permission[];
}

export interface UserSummary extends Me { createdAt: string }

export interface Role { id: string; code: string; name: string; permissions: Permission[] }

export interface Category { id: string; name: string; isGovernance: boolean }

export interface FileInfo { id: string; name: string; mimeType: string; size: number; createdAt: string; url: string }

export interface RequestItem {
  id: string; code: string; subject: string; description: string;
  category: Named & { isGovernance: boolean }; priority: Priority; status: RequestStatus;
  requester: Named; owner: Named | null; department: Named | null;
  createdAt: string; updatedAt: string; version: number; files: FileInfo[];
}

export interface Message { id: string; body: string; isInternal: boolean; author: string; createdAt: string }
export interface AuditEvent { id: number; action: string; entityType: string; entityId: string | null; entityLabel: string | null; details: Record<string, unknown>; actor: string | null; createdAt: string }
export interface AccessUser { id: string; name: string; email: string }

export interface RequestDetail extends RequestItem {
  messages: Message[]; history: AuditEvent[]; access: AccessUser[];
}

export interface CaseItem {
  id: string; number: string; title: string; party: string | null; opponent: string | null;
  court: string | null; division: string | null; phase: string | null;
  status: CaseStatus; risk: CaseRisk; claimValue: string; nextDue: string | null; notes: string | null;
  clientVisible: boolean; createdAt: string; updatedAt: string; version: number;
}

export interface CaseAccessEntry { id: string; user: AccessUser | null; department: Named | null }

export interface TaskItem {
  id: string; title: string; description: string | null; dueDate: string; priority: Priority; status: TaskStatus;
  assignee: Named | null; request: { id: string; code: string } | null; caseRef: { id: string; number: string } | null;
  version: number;
}

export interface PortalState {
  user: Me; requests: RequestItem[]; cases: CaseItem[]; tasks: TaskItem[]; activity: AuditEvent[];
  truncated: boolean; categories: Category[]; departments: Named[];
}

export interface ImportPreview {
  items: Array<{ number: string; title: string; claimValue: string }>;
  errors: Array<{ line: number | null; message: string }>;
  total: number; hash: string;
}
