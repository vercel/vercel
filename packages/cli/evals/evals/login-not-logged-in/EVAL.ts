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
 * Auth matrix login eval: we expect the agent to have run the appropriate
 * CLI commands as observed from the recorded shell commands.
 * - When CLI_EVAL_AUTH_STATE=not-logged-in: whoami (may fail) then login, then whoami.
 * - When CLI_EVAL_AUTH_STATE=logged-in: whoami (and optionally login if needed).
 */
test('agent used CLI for auth flow matching requested auth state', () => {
  const commands = getShellCommands();
  expect(commands.length).toBeGreaterThan(0);

  const whoamiCommands = commands.filter(command =>
    /\b(vercel|vc)\s+whoami\b/.test(command)
  );
  const loginCommands = commands.filter(command =>
    /\b(vercel|vc)\s+login\b/.test(command)
  );

  expect(whoamiCommands.length).toBeGreaterThan(0);

  const authState = process.env.CLI_EVAL_AUTH_STATE ?? 'logged-in';

  if (authState === 'not-logged-in') {
    expect(loginCommands.length).toBeGreaterThan(0);
  }
});
