import { existsSync, readFileSync } from 'fs';
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
 * Login/whoami eval: we expect the agent to have run a whoami-style command
 * (and optionally login) as observed from the recorded shell commands.
 */
test('agent used CLI to check authenticated user', () => {
  const commands = getShellCommands();
  expect(commands.length).toBeGreaterThan(0);

  const whoamiCommands = commands.filter(command =>
    /\b(vercel|vc)\s+whoami\b/.test(command)
  );
  expect(whoamiCommands.length).toBeGreaterThan(0);
  expect(
    whoamiCommands.some(command => command.includes('--format=json'))
  ).toBe(true);
});

test('agent saved authenticated whoami JSON output', () => {
  expect(existsSync('whoami-output.json')).toBe(true);

  const output = JSON.parse(readFileSync('whoami-output.json', 'utf-8')) as {
    username?: string;
    email?: string;
    name?: string;
  };

  expect(typeof output.username).toBe('string');
  expect(output.username!.length).toBeGreaterThan(0);
});
