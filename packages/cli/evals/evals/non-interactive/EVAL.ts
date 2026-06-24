import { existsSync, readFileSync } from 'fs';
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

test('project is linked', () => {
  expect(
    existsSync('.vercel/project.json') || existsSync('.vercel/config.json')
  ).toBe(true);
});

test('agent used vercel link', () => {
  const commands = getShellCommands();
  expect(commands.length).toBeGreaterThan(0);

  const linkCommands = commands.filter(command =>
    /\b(vercel|vc)\s+link\b/.test(command)
  );
  expect(linkCommands.length).toBeGreaterThan(0);
});

test('agent wrote linked project note', () => {
  if (existsSync('non-interactive-link.txt')) {
    expect(
      readFileSync('non-interactive-link.txt', 'utf-8').trim().length
    ).toBeGreaterThan(0);
    return;
  }

  const successfulLinkCommands = getShellCommandEntries().filter(
    entry => /\b(vercel|vc)\s+link\b/.test(entry.command) && entry.success
  );
  expect(successfulLinkCommands.length).toBeGreaterThan(0);
});
