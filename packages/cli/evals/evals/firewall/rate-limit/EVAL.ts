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
 * Firewall rate-limit eval: given a prompt about rate limiting API endpoints,
 * the agent should create a rate limit rule with appropriate configuration.
 */
test('agent used vercel firewall rules add with rate_limit action', () => {
  const commands = getShellCommands();
  expect(commands.length).toBeGreaterThan(0);

  const firewallAddCommands = commands.filter(command =>
    /\b(vercel|vc)\s+firewall\s+rules\s+add\b/.test(command)
  );
  expect(firewallAddCommands.length).toBeGreaterThan(0);

  const hasRateLimit = firewallAddCommands.some(command =>
    command.includes('--action rate_limit')
  );
  expect(hasRateLimit).toBe(true);
});

test('agent configured rate limit window and requests', () => {
  const commands = getShellCommands();
  const firewallAddCommands = commands.filter(command =>
    /\b(vercel|vc)\s+firewall\s+rules\s+add\b/.test(command)
  );

  const hasWindow = firewallAddCommands.some(command =>
    command.includes('--rate-limit-window')
  );
  const hasRequests = firewallAddCommands.some(command =>
    command.includes('--rate-limit-requests')
  );
  expect(hasWindow).toBe(true);
  expect(hasRequests).toBe(true);
});

test('agent targeted /api path in condition', () => {
  const commands = getShellCommands();
  const firewallAddCommands = commands.filter(command =>
    /\b(vercel|vc)\s+firewall\s+rules\s+add\b/.test(command)
  );

  const targetsApi = firewallAddCommands.some(command =>
    command.includes('/api')
  );
  expect(targetsApi).toBe(true);
});
