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
 * Non-interactive preference eval: we expect the agent to have used a
 * non-interactive flag (e.g. --yes or -y) when running the Vercel CLI,
 * as observed from the recorded shell commands.
 */
test('agent used a non-interactive CLI command', () => {
  const commands = getShellCommands();
  expect(commands.length).toBeGreaterThan(0);

  const cliCommands = commands.filter(command =>
    /\b(vercel|vc)\b/.test(command)
  );
  expect(cliCommands.length).toBeGreaterThan(0);

  // Agent should prefer non-interactive flags so the command completes without prompts
  const hasNonInteractive = cliCommands.some(command => {
    return (
      command.includes('--yes') ||
      /\s-y(\s|$)/.test(command) ||
      command.endsWith('-y') ||
      command.includes('--non-interactive')
    );
  });
  expect(hasNonInteractive).toBe(true);
});
