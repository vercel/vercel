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
  /** `--agent-config` overrides, so warnings can name the exact file they mean. */
  overrides?: Record<string, string>;
}

export interface AgentWarning {
  /** Stable machine-readable id for JSON payloads, e.g. 'desktop_app_breaks'. */
  code: string;
  /** What the user loses by consenting — the headline, e.g. 'The Codex desktop app will stop working.' */
  impact: string;
  /** Why connecting causes that impact: full sentences, one rendered line each. */
  why: string[];
  /**
   * How to revert after connecting, phrased to follow 'To undo,'. No trailing
   * period. Name the resolved file path, matching what the receipts print.
   */
  undo: string;
  /** The consent question, e.g. 'Configure Codex anyway?'. */
  confirm: string;
}

export interface CodingAgent {
  id: string;
  displayName: string;
  experimental?: boolean;
  detect(home: string): Promise<boolean>;
  /** Resolved config-file path: override > native env var > home default. */
  configPath(ctx: SetupContext): string;
  buildPlan(ctx: SetupContext): AgentPlan;
  /** Pre-flight warnings that need explicit consent before configuring. */
  warnings?(ctx: WarningContext): Promise<AgentWarning[]>;
}
