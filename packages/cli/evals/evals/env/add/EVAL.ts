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

function getUsedEnvKey(): string | undefined {
  if (!existsSync('env-key-used.txt')) {
    return undefined;
  }

  return readFileSync('env-key-used.txt', 'utf-8').trim();
}

function getEnvListOutput(): EnvListOutput | undefined {
  if (!existsSync('env-add-ls-output.json')) {
    return undefined;
  }

  return JSON.parse(
    readFileSync('env-add-ls-output.json', 'utf-8')
  ) as EnvListOutput;
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

test('agent used EVAL_ADD_ key in env add command', () => {
  const commands = getShellCommands();
  const envAddCommands = commands.filter(command =>
    /\b(vercel|vc)\s+env\s+add\b/.test(command)
  );
  expect(envAddCommands.length).toBeGreaterThan(0);

  const key = getUsedEnvKey();
  const output = getEnvListOutput();
  const commandUsesLiteralKey = envAddCommands.some(command =>
    /\bEVAL_ADD_[A-Za-z0-9_]+\b/.test(command)
  );
  const commandUsesShellVariable = envAddCommands.some(command =>
    /\$\{?[A-Za-z_][A-Za-z0-9_]*\}?/.test(command)
  );

  expect(
    commandUsesLiteralKey ||
      (commandUsesShellVariable && output?.envs?.some(env => env.key === key))
  ).toBe(true);
});

test('agent verified env list as JSON', () => {
  const commands = getShellCommands();
  const envListCommands = commands.filter(command =>
    /\b(vercel|vc)\s+env\s+(ls|list)\b/.test(command)
  );
  expect(envListCommands.length).toBeGreaterThan(0);
  expect(
    envListCommands.some(command => /--format(?:=|\s+)json\b/.test(command))
  ).toBe(true);
});

test('agent used EVAL_ADD_ prefix for env var name', () => {
  expect(existsSync('env-key-used.txt')).toBe(true);
  const key = getUsedEnvKey();
  expect(key).toMatch(/^EVAL_ADD_[A-Za-z0-9_]+$/);
});

test('added env var is present in project env list output', () => {
  expect(existsSync('env-key-used.txt')).toBe(true);
  expect(existsSync('env-add-ls-output.json')).toBe(true);

  const key = getUsedEnvKey();
  const output = getEnvListOutput();

  expect(Array.isArray(output?.envs)).toBe(true);
  expect(output?.envs?.some(env => env.key === key)).toBe(true);
});
