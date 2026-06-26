import type { CodingAgent } from '../types';
import { claudeCode } from './claude-code';
import { codex } from './codex';
import { opencode } from './opencode';
import { pi } from './pi';

/**
 * Registry of supported coding agents. Add a new agent by exporting a
 * `CodingAgent` from a file in this folder and appending it here.
 */
export const CODING_AGENTS: CodingAgent[] = [claudeCode, codex, opencode, pi];

/** Default targets when the user does not pass `--agent` (excludes experimental). */
export const DEFAULT_AGENTS = CODING_AGENTS.filter(a => !a.experimental);

export function getAgentById(id: string): CodingAgent | undefined {
  return CODING_AGENTS.find(a => a.id === id);
}

/**
 * Agents we know about but cannot safely configure from a config file. Listed so
 * the command can give actionable guidance instead of a generic "unknown agent".
 */
export const UNSUPPORTED_AGENTS: Record<string, string> = {
  cursor:
    'Cursor stores model settings in a SQLite database with no safely writable config, and its "Override OpenAI Base URL" GUI option is known to break other models. Set the base URL to https://ai-gateway.vercel.sh/v1 manually in Settings → Models if you want to try it.',
};
