import { readFileSync, existsSync } from 'fs';
import { test, expect } from 'vitest';

type EnvListOutput = {
  envs?: Array<{ key?: string }>;
};

type ShellCommand = {
  command: string;
  success?: boolean;
};

function getShellCommandEntries(): ShellCommand[] {
  const results = JSON.parse(
    readFileSync('__agent_eval__/results.json', 'utf-8')
  ) as {
    o11y?: { shellCommands?: ShellCommand[] };
  };

  return results.o11y?.shellCommands ?? [];
}

function getShellCommands(): string[] {
  return getShellCommandEntries().map(c => c.command);
}

/**
 * env update eval: agent adds an env var with unique key, then updates it
 * using non-interactive flags. The grader verifies command usage and success
 * from results.json without trying to correlate generated shell variable names.
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

test('agent used vercel env add', () => {
  const commands = getShellCommands();
  expect(commands.length).toBeGreaterThan(0);

  const envAddCommands = commands.filter(command =>
    /\b(vercel|vc)\s+env\s+add\b/.test(command)
  );
  expect(envAddCommands.length).toBeGreaterThan(0);
});

test('agent used non-interactive flags for add', () => {
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

test('agent env add and update commands completed successfully', () => {
  const commands = getShellCommandEntries();

  const successfulAddCommands = commands.filter(
    entry => /\b(vercel|vc)\s+env\s+add\b/.test(entry.command) && entry.success
  );
  const successfulUpdateCommands = commands.filter(
    entry =>
      /\b(vercel|vc)\s+env\s+update\b/.test(entry.command) && entry.success
  );

  expect(successfulAddCommands.length).toBeGreaterThan(0);
  expect(successfulUpdateCommands.length).toBeGreaterThan(0);
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
