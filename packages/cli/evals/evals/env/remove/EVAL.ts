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
 * using non-interactive flags. The remove command and key usage are
 * asserted from results.json and the env list.
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

test('env var with EVAL_REMOVE_ prefix was removed from project', () => {
  const commands = getShellCommands();

  const candidateKeys = new Set<string>();
  for (const command of commands) {
    const addMatch = command.match(/\benv\s+add\s+([A-Za-z0-9_]+)/);
    if (addMatch && addMatch[1]) {
      candidateKeys.add(addMatch[1]);
    }

    const removeMatch = command.match(/\benv\s+(rm|remove)\s+([A-Za-z0-9_]+)/);
    if (removeMatch && removeMatch[2]) {
      candidateKeys.add(removeMatch[2]);
    }
  }

  const keysFromCommands = [...candidateKeys];
  expect(keysFromCommands.length).toBeGreaterThan(0);

  const evalRemoveKeys = keysFromCommands.filter(key =>
    /^EVAL_REMOVE_/.test(key)
  );
  expect(evalRemoveKeys.length).toBeGreaterThan(0);

  const projectKeys = getEnvKeysFromProject();
  const stillPresent = evalRemoveKeys.some(key => projectKeys.includes(key));
  expect(stillPresent).toBe(false);
});
