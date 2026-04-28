import { readFileSync, existsSync } from 'fs';
import { test, expect } from 'vitest';

type EnvListOutput = {
  envs?: Array<{ key?: string }>;
};

function getShellCommands(): string[] {
  const results = JSON.parse(
    readFileSync('__agent_eval__/results.json', 'utf-8')
  ) as {
    o11y?: { shellCommands?: Array<{ command: string }> };
  };

  return (results.o11y?.shellCommands ?? []).map(c => c.command);
}

/**
 * env update eval: agent adds an env var with unique key, then updates it
 * using non-interactive flags. The update command and key usage are
 * asserted from results.json and the env list.
 */
test('project is linked', () => {
  expect(
    existsSync('.vercel/project.json') || existsSync('.vercel/config.json')
  ).toBe(true);
});

test('agent used vercel env update', () => {
  const commands = getShellCommands();
  expect(commands.length).toBeGreaterThan(0);

  const envUpdateCommands = commands.filter(command =>
    /\b(vercel|vc)\s+env\s+update\b/.test(command)
  );
  expect(envUpdateCommands.length).toBeGreaterThan(0);
});

test('agent used non-interactive flags for update', () => {
  const commands = getShellCommands();
  const envUpdateCommands = commands.filter(command =>
    /\b(vercel|vc)\s+env\s+update\b/.test(command)
  );
  expect(envUpdateCommands.length).toBeGreaterThan(0);

  const hasNonInteractive = envUpdateCommands.some(command => {
    return (
      command.includes('--yes') ||
      /\s-y(\s|$)/.test(command) ||
      command.includes('--non-interactive') ||
      command.includes('--value')
    );
  });
  expect(hasNonInteractive).toBe(true);
});

test('agent used EVAL_UPDATE_ prefix for env var name', () => {
  expect(existsSync('env-key-used.txt')).toBe(true);
  const key = readFileSync('env-key-used.txt', 'utf-8').trim();
  expect(key).toMatch(/^EVAL_UPDATE_[A-Za-z0-9_]+$/);
});

test('updated env var is present in project env list output', () => {
  expect(existsSync('env-key-used.txt')).toBe(true);
  expect(existsSync('env-update-ls-output.json')).toBe(true);

  const key = readFileSync('env-key-used.txt', 'utf-8').trim();
  const output = JSON.parse(
    readFileSync('env-update-ls-output.json', 'utf-8')
  ) as EnvListOutput;

  expect(Array.isArray(output.envs)).toBe(true);
  expect(output.envs?.some(env => env.key === key)).toBe(true);
});
