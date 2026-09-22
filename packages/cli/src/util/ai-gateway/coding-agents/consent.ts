import chalk from 'chalk';
import type Client from '../../client';
import output from '../../../output-manager';
import { printWarning } from './render';
import type { AgentWarning, CodingAgent, WarningContext } from './types';

export interface AgentWarningEntry {
  agent: CodingAgent;
  warning: AgentWarning;
}

export async function collectAgentWarnings(
  agents: CodingAgent[],
  ctx: WarningContext
): Promise<AgentWarningEntry[]> {
  const entries: AgentWarningEntry[] = [];
  for (const agent of agents) {
    for (const warning of (await agent.warnings?.(ctx)) ?? []) {
      entries.push({ agent, warning });
    }
  }
  return entries;
}

/** One paragraph for JSON payloads and skip hints; human output uses printAgentWarning. */
export function formatWarningMessage(warning: AgentWarning): string {
  return `${warning.impact} ${warning.why.join(' ')} To undo, ${warning.undo}.`;
}

/** Impact on the `!` gutter row; cause lines and undo dimmed behind the gutter. */
export function printAgentWarning(warning: AgentWarning): void {
  output.print('\n');
  printWarning(warning.impact);
  for (const line of warning.why) {
    output.print(chalk.dim(`  ${line}\n`));
  }
  output.print(chalk.dim(`  To undo: ${warning.undo}.\n`));
}

/** Warnings grouped per agent, preserving entry order. */
export function groupWarningsByAgent(
  entries: AgentWarningEntry[]
): Map<CodingAgent, AgentWarning[]> {
  const grouped = new Map<CodingAgent, AgentWarning[]>();
  for (const { agent, warning } of entries) {
    const list = grouped.get(agent) ?? [];
    list.push(warning);
    grouped.set(agent, list);
  }
  return grouped;
}

export async function promptAgentConsent(
  client: Client,
  entries: AgentWarningEntry[]
): Promise<Set<string>> {
  const declined = new Set<string>();
  // One decision per agent: all of its warnings first, then a single
  // confirm — never a second question that could contradict the first.
  for (const [agent, warnings] of groupWarningsByAgent(entries)) {
    for (const warning of warnings) {
      printAgentWarning(warning);
    }
    const confirm =
      warnings.length === 1
        ? warnings[0].confirm
        : `Configure ${agent.displayName} anyway?`;
    // Indented under the warnings it answers, like other child prompts.
    const ok = await client.input.confirm(
      `${chalk.dim('↳')} ${confirm}`,
      false
    );
    if (!ok) {
      declined.add(agent.id);
    }
  }
  return declined;
}
