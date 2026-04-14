import { readFileSync } from 'fs';
import { test, expect } from 'vitest';

function getShellCommands(): string[] {
  const results = JSON.parse(
    readFileSync('__agent_eval__/results.json', 'utf-8')
  ) as {
    o11y?: { shellCommands?: Array<{ command: string }> };
  };

  return (results.o11y?.shellCommands ?? []).map(c => c.command);
}

/**
 * Firewall list-rules eval: given a prompt about viewing firewall config,
 * the agent should use `vercel firewall rules list` or `vercel firewall overview`.
 */
test('agent used vercel firewall to view rules', () => {
  const commands = getShellCommands();
  expect(commands.length).toBeGreaterThan(0);

  const viewCommands = commands.filter(
    command =>
      /\b(vercel|vc)\s+firewall\s+rules\s+list\b/.test(command) ||
      /\b(vercel|vc)\s+firewall\s+overview\b/.test(command) ||
      /\b(vercel|vc)\s+firewall\s+rules\s+inspect\b/.test(command)
  );
  expect(viewCommands.length).toBeGreaterThan(0);
});

test('agent used --json or --expand for detailed output', () => {
  const commands = getShellCommands();
  const firewallCommands = commands.filter(command =>
    /\b(vercel|vc)\s+firewall\b/.test(command)
  );

  const hasDetailedOutput = firewallCommands.some(
    command =>
      command.includes('--json') ||
      command.includes('--expand') ||
      /\s+inspect\s/.test(command)
  );
  expect(hasDetailedOutput).toBe(true);
});
