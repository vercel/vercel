import type { TopModel } from './top-models';
import type { Model } from '../models';

export type CodingAgentsSetupResult =
  | {
      exitCode: 0;
      outcome:
        | 'configured'
        | 'already_configured'
        | 'dry_run'
        | 'canceled'
        | 'skipped'
        | 'agent_prompt';
    }
  | { exitCode: 1 | 2; outcome: 'failed' };

export interface SetupContext {
  apiKey: string;
  tokenPass?: boolean;
  home: string;
  useKeychain?: boolean;
  overrides?: Record<string, string>;
  shellRcOverride?: string;
  baseUrlOverride?: string;
  topModels?: TopModel[];
  gatewayModels?: Model[];
}

export type FileFormat = 'json' | 'toml' | 'yaml' | 'shell' | 'text';

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
  plain?: boolean; // non-secret: exported literally even in Keychain mode
}

export interface AgentPlan {
  fileChanges: FileChange[];
  envExports: EnvExport[];
  notes: string[];
  actionRequired?: boolean;
}

export interface SessionMigrationContext {
  home: string;
}

export interface SessionMigrationResult {
  copied: number;
  skipped: number;
  errors?: string[];
}

export interface SessionMigrationPlan {
  label: string;
  itemCount: number;
  totalBytes: number;
  sourceRoots: string[];
  destinationRoots: string[];
  prompt: string[];
  apply(): Promise<SessionMigrationResult>;
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
  needsTopModels?: boolean;
  needsModelCatalogue?: boolean;
  honorsBaseUrl?: boolean;
  detect(home: string): Promise<boolean>;
  configPath(ctx: SetupContext): string;
  buildPlan(ctx: SetupContext): AgentPlan;
  warnings?(ctx: WarningContext): Promise<AgentWarning[]>;
  sessionMigration?: {
    plan(ctx: SessionMigrationContext): Promise<SessionMigrationPlan | null>;
  };
}
