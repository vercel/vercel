/**
 * Modular contract for configuring a local coding agent to use the AI Gateway.
 *
 * Adding support for a new agent should be a single file under `agents/` that
 * exports a `CodingAgent`, plus one line in `agents/index.ts`. Everything else
 * (diffing, backups, prompts, JSON output) is handled by the orchestrator.
 */

/** Inputs an agent needs to render its config. */
export interface SetupContext {
  /** The Gateway API key (or {@link KEY_PLACEHOLDER} during preview). */
  apiKey: string;
  /** Home directory to resolve config paths against (overridable in tests). */
  home: string;
}

export type FileFormat = 'json' | 'toml' | 'shell';

/** A single config file an agent wants to create or update. */
export interface FileChange {
  /** Absolute path to the config file. */
  path: string;
  /** Short human label, e.g. `Claude Code settings`. */
  label: string;
  format: FileFormat;
  /** File mode for newly created files (e.g. 0o600 for credential files). */
  mode?: number;
  /**
   * Pure transform: given the current file contents (or `null` if the file does
   * not exist), return the new contents. Must throw if the existing file cannot
   * be parsed, so the orchestrator can skip it rather than clobber it.
   */
  transform(current: string | null): string;
}

/** An env var that must be present in the user's shell for an agent to work. */
export interface EnvExport {
  name: string;
  value: string;
}

/** What a single agent wants done. */
export interface AgentPlan {
  fileChanges: FileChange[];
  /** Env vars required in the shell (consolidated into one managed rc block). */
  envExports: EnvExport[];
  /** Extra human notes to surface after applying (e.g. how to invoke the agent). */
  notes: string[];
}

export interface CodingAgent {
  /** Stable id used by `--agent` and JSON output, e.g. `claude-code`. */
  id: string;
  displayName: string;
  /** Experimental/unconfirmed agents are never configured unless requested by id. */
  experimental?: boolean;
  /** Best-effort check of whether the agent is installed or used locally. */
  detect(home: string): Promise<boolean>;
  /** Build the (pure) plan of config changes for this agent. */
  buildPlan(ctx: SetupContext): AgentPlan;
}
