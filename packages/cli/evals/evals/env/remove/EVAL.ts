import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { test, expect } from 'vitest';

function getEnvKeysFromProject(): string[] {
  const keys = new Set<string>();
  for (const target of ['production', 'preview']) {
    const out = execSync(`vercel env ls ${target} --format json`, {
      encoding: 'utf-8',
      cwd: process.cwd(),
    });
    const data = JSON.parse(out) as { envs?: Array<{ key: string }> };
    for (const e of data.envs ?? []) keys.add(e.key);
  }
  return [...keys];
}

function getShellCommands(): string[] {
  const results = JSON.parse(
    readFileSync('__agent_eval__/results.json', 'utf-8')
  ) as {
    o11y?: { shellCommands?: Array<{ command: string }> };
  };

  return (results.o11y?.shellCommands ?? []).map(c => c.command);
}

/**
 * env remove eval: agent adds an env var with unique key, then removes it
 * using non-interactive flags, and records the key. The remove command is
 * asserted from results.json.
 */
test('project is linked', () => {
  expect(
    existsSync('.vercel/project.json') || existsSync('.vercel/config.json')
  ).toBe(true);
});

test('agent used vercel env remove', () => {
  const commands = getShellCommands();
  expect(commands.length).toBeGreaterThan(0);

  const envRemoveCommands = commands.filter(command =>
    /\b(vercel|vc)\s+env\s+(rm|remove)\b/.test(command)
  );
  expect(envRemoveCommands.length).toBeGreaterThan(0);
});

test('agent used non-interactive flags for remove', () => {
  const commands = getShellCommands();
  const envRemoveCommands = commands.filter(command =>
    /\b(vercel|vc)\s+env\s+(rm|remove)\b/.test(command)
  );
  expect(envRemoveCommands.length).toBeGreaterThan(0);

  const hasNonInteractive = envRemoveCommands.some(command => {
    return (
      command.includes('--yes') ||
      /\s-y(\s|$)/.test(command) ||
      command.includes('--non-interactive')
    );
  });
  expect(hasNonInteractive).toBe(true);
});

test('agent recorded the env key used', () => {
  expect(existsSync('env-key-used.txt')).toBe(true);

  const key = readFileSync('env-key-used.txt', 'utf-8').trim();
  expect(key.length).toBeGreaterThan(0);
  expect(key).toMatch(/^EVAL_REMOVE_/);
});

test('env var was removed from project', () => {
  const key = readFileSync('env-key-used.txt', 'utf-8').trim();
  const keys = getEnvKeysFromProject();
  expect(keys).not.toContain(key);
});
