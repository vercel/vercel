export interface SetupContext {
  apiKey: string;
  home: string;
  useKeychain?: boolean;
  overrides?: Record<string, string>;
  shellRcOverride?: string;
}

export type FileFormat = 'json' | 'toml' | 'shell';

export interface FileChange {
  path: string;
  label: string;
  format: FileFormat;
  mode?: number;
  transform(current: string | null): string;
}

export interface EnvExport {
  name: string;
  value: string;
}

export interface AgentPlan {
  fileChanges: FileChange[];
  envExports: EnvExport[];
  notes: string[];
}

/**
 * Context available before a key exists or any setup question has been asked —
 * warnings run first so the user can bail before the key interview.
 */
export interface WarningContext {
  home: string;
  overrides?: Record<string, string>;
}

export interface AgentWarning {
  code: string;
  impact: string;
  why: string[];
  undo: string;
  confirm: string;
}

export interface CodingAgent {
  id: string;
  displayName: string;
  experimental?: boolean;
  detect(home: string): Promise<boolean>;
  configPath(ctx: SetupContext): string;
  buildPlan(ctx: SetupContext): AgentPlan;
  warnings?(ctx: WarningContext): Promise<AgentWarning[]>;
}
