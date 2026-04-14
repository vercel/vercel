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
 * Firewall ip-block eval: given a specific malicious IP, the agent should
 * use `vercel firewall ip-blocks block` to block it.
 */
test('agent used vercel firewall ip-blocks block', () => {
  const commands = getShellCommands();
  expect(commands.length).toBeGreaterThan(0);

  const blockCommands = commands.filter(command =>
    /\b(vercel|vc)\s+firewall\s+ip-blocks\s+block\b/.test(command)
  );
  expect(blockCommands.length).toBeGreaterThan(0);
});

test('agent blocked the correct IP', () => {
  const commands = getShellCommands();
  const blockCommands = commands.filter(command =>
    /\b(vercel|vc)\s+firewall\s+ip-blocks\s+block\b/.test(command)
  );

  const hasCorrectIp = blockCommands.some(command =>
    command.includes('203.0.113.42')
  );
  expect(hasCorrectIp).toBe(true);
});

test('agent used --yes for non-interactive execution', () => {
  const commands = getShellCommands();
  const blockCommands = commands.filter(command =>
    /\b(vercel|vc)\s+firewall\b/.test(command)
  );

  const hasYes = blockCommands.some(
    command => command.includes('--yes') || /\s-y(\s|$)/.test(command)
  );
  expect(hasYes).toBe(true);
});
