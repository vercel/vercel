import chalk from 'chalk';
import type Client from '../../client';
import { AGENT_REASON } from '../../agent-output-constants';
import { CHECKBOX_INSTRUCTIONS } from '../../input/checkbox-instructions';
import {
  DEFAULT_AGENTS,
  getAgentById,
  TOKEN_PASS_AGENTS,
  UNSUPPORTED_AGENTS,
} from './agents';
import type { CodingAgent } from './types';
import { defaultKeyName, type KeyOptions } from './key-source';

export function resolveKeyOptions(opts: KeyOptions): KeyOptions {
  return {
    ...opts,
    name: opts.name ?? (opts.tokenPass ? defaultKeyName(true) : undefined),
  };
}

export type ResolveResult =
  | { selected: CodingAgent[]; guidance: string[]; unsupported: string[] }
  | { error: string; reason: string };

export async function resolveAgents(args: {
  client: Client;
  agentFlags?: string[];
  all?: boolean;
  tokenPass?: boolean;
  canPrompt: boolean;
  yes?: boolean;
  home: string;
}): Promise<ResolveResult> {
  const { client, agentFlags, all, tokenPass, canPrompt, yes, home } = args;
  const availableAgents = tokenPass ? TOKEN_PASS_AGENTS : DEFAULT_AGENTS;
  const guidance: string[] = [];
  const unsupported: string[] = [];

  if (agentFlags && agentFlags.length > 0) {
    const selected: CodingAgent[] = [];
    const unknown: string[] = [];
    for (const raw of agentFlags) {
      const id = raw.toLowerCase();
      const agent = tokenPass
        ? availableAgents.find(a => a.id === id)
        : getAgentById(id);
      if (agent) {
        if (!selected.includes(agent)) selected.push(agent);
      } else if (!tokenPass && UNSUPPORTED_AGENTS[id]) {
        unsupported.push(id);
        guidance.push(`${id}: ${UNSUPPORTED_AGENTS[id]}`);
      } else {
        unknown.push(raw);
      }
    }
    if (unknown.length > 0) {
      const known = availableAgents.map(a => a.id).join(', ');
      return {
        error: `${tokenPass ? 'Unsupported Token Pass' : 'Unknown'} agent(s): ${unknown.join(', ')}. Supported: ${known}.`,
        reason: AGENT_REASON.INVALID_ARGUMENTS,
      };
    }
    if (selected.length === 0) {
      return {
        error: 'No configurable agents selected.',
        reason: AGENT_REASON.INVALID_ARGUMENTS,
      };
    }
    return { selected, guidance, unsupported };
  }

  if (all) {
    return { selected: availableAgents, guidance, unsupported };
  }

  const detected = await Promise.all(availableAgents.map(a => a.detect(home)));

  if (!canPrompt || yes) {
    const selected = availableAgents.filter((_, i) => detected[i]);
    if (selected.length === 0) {
      return {
        error:
          'No coding agents detected on this machine. Pass --agent <name> (repeatable) or --all.',
        reason: AGENT_REASON.INVALID_ARGUMENTS,
      };
    }
    return { selected, guidance, unsupported };
  }

  const choices = availableAgents.map((agent, i) => ({
    name: agent.displayName,
    value: agent.id,
    checked: detected[i],
  }));
  const picked = await client.input.checkbox<string>({
    message: `Which coding agents should use the AI Gateway?\n${chalk.dim(
      '  Detected agents are pre-selected ·'
    )}${CHECKBOX_INSTRUCTIONS}`,
    instructions: false,
    loop: false,
    pageSize: Math.max(choices.length, 7),
    choices,
  });
  const selected = picked
    .map(id => getAgentById(id))
    .filter((a): a is CodingAgent => Boolean(a));
  if (selected.length === 0) {
    return {
      error: 'Select at least one agent to configure.',
      reason: AGENT_REASON.INVALID_ARGUMENTS,
    };
  }
  return { selected, guidance, unsupported };
}
