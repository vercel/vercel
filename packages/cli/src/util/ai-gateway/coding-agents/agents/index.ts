import type { CodingAgent } from '../types';
import { claudeCode } from './claude-code';
import { cline } from './cline';
import { codex } from './codex';
import { cursor } from './cursor';
import { hermes } from './hermes';
import { kilo } from './kilo';
import { openclaw } from './openclaw';
import { opencode } from './opencode';
import { pi } from './pi';

export const CODING_AGENTS: CodingAgent[] = [
  claudeCode,
  cline,
  codex,
  cursor,
  hermes,
  kilo,
  openclaw,
  opencode,
  pi,
];

export const DEFAULT_AGENTS = CODING_AGENTS.filter(a => !a.experimental);

export function getAgentById(id: string): CodingAgent | undefined {
  return CODING_AGENTS.find(a => a.id === id);
}

// Agents we deliberately do not support, with the reason shown to users.
// (Cursor graduated to an experimental guided setup — see agents/cursor.ts.)
export const UNSUPPORTED_AGENTS: Record<string, string> = {};
