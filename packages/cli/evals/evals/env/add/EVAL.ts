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

/**
 * env add eval: agent adds an env var with a unique key using non-interactive flags,
 * and records the command and key in command-used.txt and env-key-used.txt.
 */
test('project is linked', () => {
  expect(
    existsSync('.vercel/project.json') || existsSync('.vercel/config.json')
  ).toBe(true);
});

test('agent used vercel env add', () => {
  expect(existsSync('command-used.txt')).toBe(true);

  const command = readFileSync('command-used.txt', 'utf-8').trim();
  expect(command.length).toBeGreaterThan(0);
  expect(command).toMatch(/\b(vercel|vc)\s+env\s+add\b/);
});

test('agent used non-interactive flags', () => {
  const command = readFileSync('command-used.txt', 'utf-8').trim();
  const hasNonInteractive =
    command.includes('--yes') ||
    /\s-y(\s|$)/.test(command) ||
    command.includes('--non-interactive') ||
    command.includes('--value');
  expect(hasNonInteractive).toBe(true);
});

test('agent recorded the env key used', () => {
  expect(existsSync('env-key-used.txt')).toBe(true);

  const key = readFileSync('env-key-used.txt', 'utf-8').trim();
  expect(key.length).toBeGreaterThan(0);
  expect(key).toMatch(/^EVAL_ADD_/);
});

test('env var exists on project', () => {
  const key = readFileSync('env-key-used.txt', 'utf-8').trim();
  const keys = getEnvKeysFromProject();
  expect(keys).toContain(key);
});
