import { constants } from 'node:fs';
import { access } from 'node:fs/promises';

const DEVIN_LOCAL_PATH = '/opt/.devin';

const CURSOR = 'cursor' as const;
const CURSOR_CLI = 'cursor-cli' as const;
const CLAUDE = 'claude' as const;
const DEVIN = 'devin' as const;
const REPLIT = 'replit' as const;
const GEMINI = 'gemini' as const;
const CODEX = 'codex' as const;
const AUGMENT_CLI = 'augment-cli' as const;
const OPENCODE = 'opencode' as const;

export type KnownAgentNames =
  | typeof CURSOR
  | typeof CURSOR_CLI
  | typeof CLAUDE
  | typeof DEVIN
  | typeof REPLIT
  | typeof GEMINI
  | typeof CODEX
  | typeof AUGMENT_CLI
  | typeof OPENCODE;

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
  DEVIN,
  REPLIT,
  GEMINI,
  CODEX,
  AUGMENT_CLI,
  OPENCODE,
} as const;

export async function determineAgent(): Promise<AgentResult> {
  if (process.env.AI_AGENT) {
    const name = process.env.AI_AGENT.trim();
    if (name) {
      return {
        isAgent: true,
        agent: { name: name as KnownAgentNames },
      };
    }
  }

  if (process.env.CURSOR_TRACE_ID) {
    return { isAgent: true, agent: { name: CURSOR } };
  }

  if (process.env.CURSOR_AGENT) {
    return { isAgent: true, agent: { name: CURSOR_CLI } };
  }

  if (process.env.GEMINI_CLI) {
    return { isAgent: true, agent: { name: GEMINI } };
  }

  if (process.env.CODEX_SANDBOX) {
    return { isAgent: true, agent: { name: CODEX } };
  }

  if (process.env.AUGMENT_AGENT) {
    return { isAgent: true, agent: { name: AUGMENT_CLI } };
  }

  if (process.env.OPENCODE_CLIENT) {
    return { isAgent: true, agent: { name: OPENCODE } };
  }

  if (process.env.CLAUDECODE || process.env.CLAUDE_CODE) {
    return { isAgent: true, agent: { name: CLAUDE } };
  }

  if (process.env.REPL_ID) {
    return { isAgent: true, agent: { name: REPLIT } };
  }

  try {
    await access(DEVIN_LOCAL_PATH, constants.F_OK);
    return { isAgent: true, agent: { name: DEVIN } };
  } catch (_error) {
    // noop
  }

  return { isAgent: false, agent: undefined };
}
