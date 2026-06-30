import type { CodingAgent } from '../types';
import { claudeCode } from './claude-code';
import { codex } from './codex';

export const CODING_AGENTS: CodingAgent[] = [claudeCode, codex];

export const DEFAULT_AGENTS = CODING_AGENTS.filter(a => !a.experimental);

export function getAgentById(id: string): CodingAgent | undefined {
  return CODING_AGENTS.find(a => a.id === id);
}

export const UNSUPPORTED_AGENTS: Record<string, string> = {
  cursor:
    'Cursor stores model settings in a SQLite database with no safely writable config, and its "Override OpenAI Base URL" GUI option is known to break other models. Set the base URL to https://ai-gateway.vercel.sh/v1 manually in Settings → Models if you want to try it.',
};
