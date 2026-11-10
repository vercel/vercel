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
 * Auth matrix login eval: we expect the agent to have run the appropriate
 * CLI commands as observed from the recorded shell commands.
 * - When CLI_EVAL_AUTH_STATE=not-logged-in: whoami (may fail) then login, then whoami.
 * - When CLI_EVAL_AUTH_STATE=logged-in: whoami (and optionally login if needed).
 */
test('agent checked unauthenticated and authenticated CLI behavior', () => {
  const commands = getShellCommands();
  expect(commands.length).toBeGreaterThan(0);

  const whoamiCommands = commands.filter(command =>
    /\b(vercel|vc)\s+whoami\b/.test(command)
  );
  expect(whoamiCommands.length).toBeGreaterThanOrEqual(2);
  expect(
    commands.some(
      command =>
        command.includes('VERCEL_TOKEN') &&
        (command.includes('unset') || command.includes('env -u'))
    )
  ).toBe(true);
  expect(
    whoamiCommands.some(
      command =>
        command.includes('--format=json') ||
        /--format\s+json\b/.test(command) ||
        command.includes('--json')
    )
  ).toBe(true);
});

test('agent saved unauthenticated error and authenticated identity', () => {
  expect(existsSync('whoami-not-logged-in.txt')).toBe(true);
  expect(existsSync('whoami-after-auth.json')).toBe(true);

  const unauthOutput = readFileSync('whoami-not-logged-in.txt', 'utf-8');
  expect(unauthOutput.trim().length).toBeGreaterThan(0);
  expect(
    /not\s+logged\s+in|not\s+authenticated|login|auth/i.test(unauthOutput)
  ).toBe(true);

  const authOutput = JSON.parse(
    readFileSync('whoami-after-auth.json', 'utf-8')
  ) as { username?: string };
  expect(typeof authOutput.username).toBe('string');
  expect(authOutput.username!.length).toBeGreaterThan(0);
});
