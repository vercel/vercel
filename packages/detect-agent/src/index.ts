import { access } from 'node:fs/promises';
import { constants } from 'node:fs';

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
}

export type AgentResult =
  | {
      isAgent: true;
      agent: KnownAgentDetails;
    }
  | {
      isAgent: false;
      agent: undefined;
    };

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

export function determineAgentFromEnv(
  env: NodeJS.ProcessEnv = process.env
): AgentResult {
  if (env.AI_AGENT) {
    const name = env.AI_AGENT.trim();
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

  if (env.CURSOR_TRACE_ID) {
    return { isAgent: true, agent: { name: CURSOR } };
  }

  if (env.CURSOR_AGENT || env.CURSOR_EXTENSION_HOST_ROLE === 'agent-exec') {
    return { isAgent: true, agent: { name: CURSOR_CLI } };
  }

  if (env.GEMINI_CLI) {
    return { isAgent: true, agent: { name: GEMINI } };
  }

  if (env.CODEX_SANDBOX || env.CODEX_CI || env.CODEX_THREAD_ID) {
    return { isAgent: true, agent: { name: CODEX } };
  }

  if (env.ANTIGRAVITY_AGENT) {
    return { isAgent: true, agent: { name: ANTIGRAVITY } };
  }

  if (env.AUGMENT_AGENT) {
    return { isAgent: true, agent: { name: AUGMENT_CLI } };
  }

  if (env.OPENCODE_CLIENT) {
    return { isAgent: true, agent: { name: OPENCODE } };
  }

  if (env.CLAUDECODE || env.CLAUDE_CODE) {
    if (env.CLAUDE_CODE_IS_COWORK) {
      return { isAgent: true, agent: { name: COWORK } };
    }
    return { isAgent: true, agent: { name: CLAUDE } };
  }

  if (env.REPL_ID) {
    return { isAgent: true, agent: { name: REPLIT } };
  }

  if (env.COPILOT_MODEL || env.COPILOT_ALLOW_ALL || env.COPILOT_GITHUB_TOKEN) {
    return { isAgent: true, agent: { name: GITHUB_COPILOT } };
  }

  return { isAgent: false, agent: undefined };
}

export async function determineAgent(): Promise<AgentResult> {
  const result = determineAgentFromEnv(process.env);
  if (result.isAgent) {
    return result;
  }

  try {
    await access(DEVIN_LOCAL_PATH, constants.F_OK);
    return { isAgent: true, agent: { name: DEVIN } };
  } catch (_error) {
    // noop
  }

  return { isAgent: false, agent: undefined };
}
