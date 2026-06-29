export interface SetupContext {
  apiKey: string;
  home: string;
  /** Per-agent config-file path overrides, keyed by agent id. */
  overrides?: Record<string, string>;
  /** Override for the shell rc file env exports are written into. */
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

export interface CodingAgent {
  id: string;
  displayName: string;
  experimental?: boolean;
  detect(home: string): Promise<boolean>;
  /** Resolved config-file path: override > native env var > home default. */
  configPath(ctx: SetupContext): string;
  buildPlan(ctx: SetupContext): AgentPlan;
}
