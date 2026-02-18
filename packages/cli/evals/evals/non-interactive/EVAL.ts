import { readFileSync, existsSync } from 'fs';
import { test, expect } from 'vitest';

/**
 * Non-interactive preference eval: we expect the agent to have used a
 * non-interactive flag (e.g. --yes or -y) when running the Vercel CLI,
 * and to have recorded the command in command-used.txt.
 */
test('agent used a non-interactive CLI command', () => {
  expect(existsSync('command-used.txt')).toBe(true);

  const command = readFileSync('command-used.txt', 'utf-8').trim();
  expect(command.length).toBeGreaterThan(0);

  // Agent should prefer non-interactive flags so the command completes without prompts
  const hasNonInteractive =
    command.includes('--yes') ||
    /\s-y(\s|$)/.test(command) ||
    command.endsWith('-y');
  expect(hasNonInteractive).toBe(true);
});
