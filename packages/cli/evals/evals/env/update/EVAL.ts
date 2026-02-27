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

test('env var with EVAL_UPDATE_ prefix exists on project', () => {
  const commands = getShellCommands();

  const candidateKeys = new Set<string>();
  for (const command of commands) {
    const addMatch = command.match(/\benv\s+add\s+([A-Za-z0-9_]+)/);
    if (addMatch && addMatch[1]) {
      candidateKeys.add(addMatch[1]);
    }

    const updateMatch = command.match(/\benv\s+update\s+([A-Za-z0-9_]+)/);
    if (updateMatch && updateMatch[1]) {
      candidateKeys.add(updateMatch[1]);
    }
  }

  const keysFromCommands = [...candidateKeys];
  expect(keysFromCommands.length).toBeGreaterThan(0);

  const evalUpdateKeys = keysFromCommands.filter(key =>
    /^EVAL_UPDATE_/.test(key)
  );
  expect(evalUpdateKeys.length).toBeGreaterThan(0);

  const projectKeys = getEnvKeysFromProject();
  const hasMatchingKey = evalUpdateKeys.some(key => projectKeys.includes(key));
  expect(hasMatchingKey).toBe(true);
});
