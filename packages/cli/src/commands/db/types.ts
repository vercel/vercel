export type DatabaseRole = 'readonly' | 'readwrite' | 'admin';

export interface DatabaseQueryRequest {
  projectId: string;
  environment: string;
  resourceIdOrName?: string;
  role: DatabaseRole;
  sql: string;
  reason?: string;
}

export interface DatabaseQueryResponse {
  columns?: string[];
  rows?: Array<Record<string, unknown>>;
  rowCount?: number;
  durationMs?: number;
  auditId?: string;
}

export interface DatabaseSessionRequest {
  projectId: string;
  environment: string;
  resourceIdOrName?: string;
  role: DatabaseRole;
  ttl?: string;
  reason?: string;
}

export interface DatabaseShellCommand {
  executable: string;
  args: string[];
  env?: Record<string, string>;
}

export interface DatabaseSessionResponse {
  sessionId: string;
  expiresAt: string;
  auditId?: string;
  command?: DatabaseShellCommand;
}
