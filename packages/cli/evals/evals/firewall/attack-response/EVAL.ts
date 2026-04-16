import { readFileSync } from 'fs';
import { test, expect } from 'vitest';

function getAgentOutput(): string {
  const results = JSON.parse(
    readFileSync('__agent_eval__/results.json', 'utf-8')
  ) as {
    o11y?: {
      shellCommands?: Array<{ command: string }>;
      agentMessages?: Array<{ content: string }>;
    };
  };

  const commands = (results.o11y?.shellCommands ?? [])
    .map(c => c.command)
    .join('\n');
  const messages = (results.o11y?.agentMessages ?? [])
    .map(m => m.content)
    .join('\n');
  return `${commands}\n${messages}`;
}

/**
 * Firewall attack-response eval: given an emergency DDoS scenario,
 * the agent should recommend attack mode or suggest firewall commands.
 * Since attack mode is blocked for agents, the agent should explain
 * the situation and suggest the user run it manually, or suggest
 * alternative firewall rules.
 */
test('agent mentioned attack mode or firewall protections', () => {
  const output = getAgentOutput();

  const mentionsAttackMode =
    output.includes('attack-mode') || output.includes('attack mode');
  const mentionsFirewall =
    output.includes('firewall') || output.includes('rate limit');
  const mentionsDDoS = output.includes('DDoS') || output.includes('ddos');

  expect(mentionsAttackMode || mentionsFirewall || mentionsDDoS).toBe(true);
});

test('agent acknowledged attack mode requires interactive confirmation', () => {
  const output = getAgentOutput();

  // The agent should know it can't enable attack mode non-interactively
  // and either explain this limitation or suggest the user run it manually
  const mentionsLimitation =
    output.includes('interactive') ||
    output.includes('manually') ||
    output.includes('terminal') ||
    output.includes('blocked') ||
    output.includes('confirmation') ||
    // Or the agent might suggest alternative firewall rules instead
    output.includes('firewall rules add') ||
    output.includes('ip-blocks block');

  expect(mentionsLimitation).toBe(true);
});
