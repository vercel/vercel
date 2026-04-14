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
 * Firewall block-traffic eval: given a vague prompt about blocking suspicious
 * requests, the agent should discover and use `vercel firewall rules add`
 * to create a deny or challenge rule.
 */
test('agent used vercel firewall rules add', () => {
  const commands = getShellCommands();
  expect(commands.length).toBeGreaterThan(0);

  const firewallAddCommands = commands.filter(command =>
    /\b(vercel|vc)\s+firewall\s+rules\s+add\b/.test(command)
  );
  expect(firewallAddCommands.length).toBeGreaterThan(0);
});

test('agent used a deny or challenge action', () => {
  const commands = getShellCommands();
  const firewallAddCommands = commands.filter(command =>
    /\b(vercel|vc)\s+firewall\s+rules\s+add\b/.test(command)
  );
  expect(firewallAddCommands.length).toBeGreaterThan(0);

  const hasBlockingAction = firewallAddCommands.some(
    command =>
      command.includes('--action deny') ||
      command.includes('--action challenge')
  );
  expect(hasBlockingAction).toBe(true);
});

test('agent used --yes for non-interactive execution', () => {
  const commands = getShellCommands();
  const firewallCommands = commands.filter(command =>
    /\b(vercel|vc)\s+firewall\b/.test(command)
  );

  const hasYes = firewallCommands.some(
    command => command.includes('--yes') || /\s-y(\s|$)/.test(command)
  );
  expect(hasYes).toBe(true);
});
