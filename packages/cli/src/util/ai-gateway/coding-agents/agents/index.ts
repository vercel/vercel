import type { CodingAgent } from '../types';
import { claudeCode } from './claude-code';
import { cline } from './cline';
import { codex } from './codex';
import { cursor } from './cursor';
import { kilo } from './kilo';
import { opencode } from './opencode';
import { pi } from './pi';

export const CODING_AGENTS: CodingAgent[] = [
  claudeCode,
  cline,
  codex,
  cursor,
  kilo,
  opencode,
  pi,
];

export const DEFAULT_AGENTS = CODING_AGENTS.filter(a => !a.experimental);

export function getAgentById(id: string): CodingAgent | undefined {
  return CODING_AGENTS.find(a => a.id === id);
}

// Agents we deliberately do not support, with the reason shown to users.
// (Cursor graduated to an experimental guided setup — see agents/cursor.ts.)
export const UNSUPPORTED_AGENTS: Record<string, string> = {
  'command-code':
    "Command Code routes inference through its own subscription API and has no external-provider override (no base-URL env vars and no declarative provider config — verified against the shipped CLI bundle). Custom providers require a ProviderModule mod through its plugin seam; until there's a vercel-ai-gateway mod, it can't use the AI Gateway.",
};
