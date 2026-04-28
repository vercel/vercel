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
 * Non-interactive preference eval: we expect the agent to have used a
 * non-interactive flag (e.g. --yes or -y) when running the Vercel CLI,
 * as observed from the recorded shell commands.
 */
test('project is linked', () => {
  expect(
    existsSync('.vercel/project.json') || existsSync('.vercel/config.json')
  ).toBe(true);
});

test('agent used vercel link non-interactively', () => {
  const commands = getShellCommands();
  expect(commands.length).toBeGreaterThan(0);

  const linkCommands = commands.filter(command =>
    /\b(vercel|vc)\s+link\b/.test(command)
  );
  expect(linkCommands.length).toBeGreaterThan(0);

  // Agent should prefer non-interactive flags so the command completes without prompts
  const hasNonInteractive = linkCommands.some(command => {
    return (
      command.includes('--yes') ||
      /\s-y(\s|$)/.test(command) ||
      command.endsWith('-y') ||
      command.includes('--non-interactive')
    );
  });
  expect(hasNonInteractive).toBe(true);
});

test('agent wrote linked project note', () => {
  expect(existsSync('non-interactive-link.txt')).toBe(true);
  expect(
    readFileSync('non-interactive-link.txt', 'utf-8').trim().length
  ).toBeGreaterThan(0);
});
