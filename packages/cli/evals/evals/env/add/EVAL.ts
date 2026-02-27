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
 * env add eval: agent adds an env var with a unique key using non-interactive flags,
 * and we verify the key pattern and existence on the project via CLI output.
 */
test('project is linked', () => {
  expect(
    existsSync('.vercel/project.json') || existsSync('.vercel/config.json')
  ).toBe(true);
});

test('agent used vercel env add', () => {
  const commands = getShellCommands();
  expect(commands.length).toBeGreaterThan(0);

  const envAddCommands = commands.filter(command =>
    /\b(vercel|vc)\s+env\s+add\b/.test(command)
  );
  expect(envAddCommands.length).toBeGreaterThan(0);
});

test('agent used non-interactive flags', () => {
  const commands = getShellCommands();
  const envAddCommands = commands.filter(command =>
    /\b(vercel|vc)\s+env\s+add\b/.test(command)
  );
  expect(envAddCommands.length).toBeGreaterThan(0);

  const hasNonInteractive = envAddCommands.some(command => {
    return (
      command.includes('--yes') ||
      /\s-y(\s|$)/.test(command) ||
      command.includes('--non-interactive') ||
      command.includes('--value')
    );
  });
  expect(hasNonInteractive).toBe(true);
});

test('env var exists on project with EVAL_ADD_ prefix', () => {
  const commands = getShellCommands();

  const candidateKeys = new Set<string>();
  for (const command of commands) {
    const match = command.match(/\benv\s+add\s+([A-Za-z0-9_]+)/);
    if (match && match[1]) {
      candidateKeys.add(match[1]);
    }
  }

  const keysFromCommands = [...candidateKeys];
  expect(keysFromCommands.length).toBeGreaterThan(0);

  const evalAddKeys = keysFromCommands.filter(key => /^EVAL_ADD_/.test(key));
  expect(evalAddKeys.length).toBeGreaterThan(0);

  const projectKeys = getEnvKeysFromProject();
  const hasMatchingKey = evalAddKeys.some(key => projectKeys.includes(key));
  expect(hasMatchingKey).toBe(true);
});
