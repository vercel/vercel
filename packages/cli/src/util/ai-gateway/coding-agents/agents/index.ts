import type { CodingAgent } from '../types';
import { aider } from './aider';
import { claudeCode } from './claude-code';
import { cline } from './cline';
import { codex } from './codex';
import { continueCli } from './continue';
import { copilot } from './copilot';
import { crush } from './crush';
import { cursor } from './cursor';
import { deepagents } from './deepagents';
import { deepseek } from './deepseek';
import { droid } from './droid';
import { forge } from './forge';
import { fx } from './fx';
import { goose } from './goose';
import { gptme } from './gptme';
import { grok } from './grok';
import { hermes } from './hermes';
import { junie } from './junie';
import { kilo } from './kilo';
import { kimi } from './kimi';
import { omp } from './omp';
import { openclaw } from './openclaw';
import { opencode } from './opencode';
import { openhands } from './openhands';
import { pi } from './pi';
import { qwen } from './qwen';
import { vibe } from './vibe';
import { zcode } from './zcode';
import { zed } from './zed';

export const CODING_AGENTS: CodingAgent[] = [
  aider,
  claudeCode,
  cline,
  codex,
  continueCli,
  copilot,
  crush,
  cursor,
  deepagents,
  deepseek,
  droid,
  forge,
  fx,
  goose,
  gptme,
  grok,
  hermes,
  junie,
  kilo,
  kimi,
  omp,
  openclaw,
  opencode,
  openhands,
  pi,
  qwen,
  vibe,
  zcode,
  zed,
];

export const DEFAULT_AGENTS = CODING_AGENTS.filter(a => !a.experimental);

export const TOKEN_PASS_AGENTS: CodingAgent[] = [fx, opencode, pi];

export function getAgentById(id: string): CodingAgent | undefined {
  return CODING_AGENTS.find(a => a.id === id);
}

// Agents we deliberately do not support, with the reason shown to users.
export const UNSUPPORTED_AGENTS: Record<string, string> = {};
