import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { inspectProcessTree } from './proc-tree';

export { inspectProcessTree } from './proc-tree';
export type { ProcessTreeResult, HarnessMatch } from './proc-tree';

const DEVIN_LOCAL_PATH = '/opt/.devin';

const CURSOR = 'cursor' as const;
const CURSOR_CLI = 'cursor-cli' as const;
const CLAUDE = 'claude' as const;
const COWORK = 'cowork' as const;
const DEVIN = 'devin' as const;
const REPLIT = 'replit' as const;
const GEMINI = 'gemini' as const;
const CODEX = 'codex' as const;
const ANTIGRAVITY = 'antigravity' as const;
const AUGMENT_CLI = 'augment-cli' as const;
const OPENCODE = 'opencode' as const;
const GITHUB_COPILOT = 'github-copilot' as const;
const GITHUB_COPILOT_CLI = 'github-copilot-cli' as const;
const V0 = 'v0' as const;

export type KnownAgentNames =
  | typeof CURSOR
  | typeof CURSOR_CLI
  | typeof CLAUDE
  | typeof COWORK
  | typeof DEVIN
  | typeof REPLIT
  | typeof GEMINI
  | typeof CODEX
  | typeof ANTIGRAVITY
  | typeof AUGMENT_CLI
  | typeof OPENCODE
  | typeof GITHUB_COPILOT
  | typeof V0;

export interface KnownAgentDetails {
  name: KnownAgentNames;
  /** Harness version, when resolvable from the process tree. */
  version?: string;
  /** How the agent was detected. */
  source?: 'env' | 'proctree' | 'both';
}

export interface ProcessContext {
  /** PID of the matched harness process, when found. */
  harnessPid?: number;
  /** Immediate parent of this process (typically the shell). */
  shellPid?: number;
  /** System boot time (epoch seconds); guards PID reuse across reboots. */
  bootTime?: number;
}

export interface AgentDetectionConflict {
  env: KnownAgentNames;
  proctree: KnownAgentNames;
}

export type AgentResult = (
  | {
      isAgent: true;
      agent: KnownAgentDetails;
    }
  | {
      isAgent: false;
      agent: undefined;
    }
) & {
  /** Populated when `inspectProcessTree` was requested and succeeded. */
  procContext?: ProcessContext;
  /** Populated when env and process-tree detection disagree. */
  conflict?: AgentDetectionConflict;
};

export interface DetermineAgentOptions {
  /**
   * Also walk the parent process tree (Linux/macOS, ~50ms budget,
   * fail-open) to identify the harness binary and version.
   */
  inspectProcessTree?: boolean;
}

export const KNOWN_AGENTS = {
  CURSOR,
  CURSOR_CLI,
  CLAUDE,
  COWORK,
  DEVIN,
  REPLIT,
  GEMINI,
  CODEX,
  ANTIGRAVITY,
  AUGMENT_CLI,
  OPENCODE,
  GITHUB_COPILOT,
  V0,
} as const;

export async function determineAgent(
  options: DetermineAgentOptions = {}
): Promise<AgentResult> {
  const envResult = await determineAgentFromEnv();
  if (!options.inspectProcessTree) {
    return envResult;
  }

  const tree = await inspectProcessTree();
  const procContext: ProcessContext = {
    harnessPid: tree.match?.pid,
    shellPid: tree.shellPid,
    bootTime: tree.bootTime,
  };

  if (envResult.isAgent && tree.match) {
    const sameAgent = envResult.agent.name === tree.match.name;
    return {
      isAgent: true,
      agent: {
        name: envResult.agent.name,
        version: sameAgent ? tree.match.version : undefined,
        source: sameAgent ? 'both' : 'env',
      },
      procContext,
      conflict: sameAgent
        ? undefined
        : { env: envResult.agent.name, proctree: tree.match.name },
    };
  }

  if (tree.match) {
    return {
      isAgent: true,
      agent: {
        name: tree.match.name,
        version: tree.match.version,
        source: 'proctree',
      },
      procContext,
    };
  }

  if (envResult.isAgent) {
    return {
      isAgent: true,
      agent: { ...envResult.agent, source: 'env' },
      procContext,
    };
  }

  return { isAgent: false, agent: undefined, procContext };
}

async function determineAgentFromEnv(): Promise<AgentResult> {
  if (process.env.AI_AGENT) {
    const name = process.env.AI_AGENT.trim();
    if (name) {
      if (name === GITHUB_COPILOT || name === GITHUB_COPILOT_CLI) {
        return {
          isAgent: true,
          agent: { name: GITHUB_COPILOT },
        };
      }

      if (name === V0) {
        return {
          isAgent: true,
          agent: { name: V0 },
        };
      }

      return {
        isAgent: true,
        agent: { name: name as KnownAgentNames },
      };
    }
  }

  if (process.env.CURSOR_TRACE_ID) {
    return { isAgent: true, agent: { name: CURSOR } };
  }

  if (
    process.env.CURSOR_AGENT ||
    process.env.CURSOR_EXTENSION_HOST_ROLE === 'agent-exec'
  ) {
    return { isAgent: true, agent: { name: CURSOR_CLI } };
  }

  if (process.env.GEMINI_CLI) {
    return { isAgent: true, agent: { name: GEMINI } };
  }

  if (
    process.env.CODEX_SANDBOX ||
    process.env.CODEX_CI ||
    process.env.CODEX_THREAD_ID
  ) {
    return { isAgent: true, agent: { name: CODEX } };
  }

  if (process.env.ANTIGRAVITY_AGENT) {
    return { isAgent: true, agent: { name: ANTIGRAVITY } };
  }

  if (process.env.AUGMENT_AGENT) {
    return { isAgent: true, agent: { name: AUGMENT_CLI } };
  }

  if (process.env.OPENCODE_CLIENT) {
    return { isAgent: true, agent: { name: OPENCODE } };
  }

  if (process.env.CLAUDECODE || process.env.CLAUDE_CODE) {
    if (process.env.CLAUDE_CODE_IS_COWORK) {
      return { isAgent: true, agent: { name: COWORK } };
    }
    return { isAgent: true, agent: { name: CLAUDE } };
  }

  if (process.env.REPL_ID) {
    return { isAgent: true, agent: { name: REPLIT } };
  }

  if (
    process.env.COPILOT_MODEL ||
    process.env.COPILOT_ALLOW_ALL ||
    process.env.COPILOT_GITHUB_TOKEN
  ) {
    return { isAgent: true, agent: { name: GITHUB_COPILOT } };
  }

  try {
    await access(DEVIN_LOCAL_PATH, constants.F_OK);
    return { isAgent: true, agent: { name: DEVIN } };
  } catch (_error) {
    // noop
  }

  return { isAgent: false, agent: undefined };
}
