import { existsSync, readFileSync } from 'fs';
import { test, expect } from 'vitest';

function getShellCommands(): string[] {
  const results = JSON.parse(
    readFileSync('__agent_eval__/results.json', 'utf-8')
  ) as {
    o11y?: { shellCommands?: Array<{ command: string }> };
  };

  return (results.o11y?.shellCommands ?? []).map(c => c.command);
}

function usesJsonOutput(command: string): boolean {
  return /--json\b/.test(command) || /--format(?:=|\s+)json\b/.test(command);
}

test('agent used vercel project list with JSON output', () => {
  const commands = getShellCommands();
  const listCommands = commands.filter(command =>
    /\b(vercel|vc)\s+project\s+(ls|list)\b/.test(command)
  );

  expect(listCommands.length).toBeGreaterThan(0);
  expect(listCommands.some(usesJsonOutput)).toBe(true);
});

test('agent saved project list JSON output', () => {
  expect(existsSync('project-list-output.json')).toBe(true);

  const output = JSON.parse(
    readFileSync('project-list-output.json', 'utf-8')
  ) as {
    projects?: unknown;
  };

  expect(Array.isArray(output.projects)).toBe(true);
});
