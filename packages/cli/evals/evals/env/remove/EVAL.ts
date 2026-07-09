import { readFileSync, existsSync } from 'fs';
import { test, expect } from 'vitest';

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
 * env remove eval: agent adds an env var with unique key, then removes it
 * using non-interactive flags. The grader verifies command usage and success
 * from results.json without trying to correlate generated shell variable names.
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

test('agent env add and remove commands completed successfully', () => {
  const commands = getShellCommandEntries();

  const successfulAddCommands = commands.filter(
    entry => /\b(vercel|vc)\s+env\s+add\b/.test(entry.command) && entry.success
  );
  const successfulRemoveCommands = commands.filter(
    entry =>
      /\b(vercel|vc)\s+env\s+(rm|remove)\b/.test(entry.command) && entry.success
  );

  expect(successfulAddCommands.length).toBeGreaterThan(0);
  expect(successfulRemoveCommands.length).toBeGreaterThan(0);
});
