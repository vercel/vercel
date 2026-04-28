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
 * vc env eval: we expect the agent to have run an env subcommand (e.g. ls)
 * as observed from the recorded shell commands.
 */
test('project is linked', () => {
  expect(
    existsSync('.vercel/project.json') || existsSync('.vercel/config.json')
  ).toBe(true);
});

test('agent used vc env command', () => {
  const commands = getShellCommands();
  expect(commands.length).toBeGreaterThan(0);

  const envCommands = commands.filter(command =>
    /\b(vercel|vc)\s+env\b/.test(command)
  );
  expect(envCommands.length).toBeGreaterThan(0);

  const listCommand = envCommands.find(command =>
    /\b(ls|list)\b/.test(command)
  );
  expect(listCommand).toBeDefined();
  expect(envCommands.some(command => command.includes('--format=json'))).toBe(
    true
  );
});

test('agent saved env list JSON output', () => {
  expect(existsSync('env-ls-output.json')).toBe(true);

  const output = JSON.parse(readFileSync('env-ls-output.json', 'utf-8')) as {
    envs?: unknown;
  };

  expect(Array.isArray(output.envs)).toBe(true);
});
