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

test('agent used vercel project inspect', () => {
  const commands = getShellCommands();
  const inspectCommands = commands.filter(command =>
    /\b(vercel|vc)\s+project\s+inspect\b/.test(command)
  );

  expect(inspectCommands.length).toBeGreaterThan(0);
});

test('agent saved project inspect output and summary', () => {
  expect(existsSync('project-inspect-output.txt')).toBe(true);
  expect(existsSync('project-inspect-answer.txt')).toBe(true);

  const output = readFileSync('project-inspect-output.txt', 'utf-8');
  const answer = readFileSync('project-inspect-answer.txt', 'utf-8');

  expect(output.trim().length).toBeGreaterThan(0);
  expect(output).toMatch(/\bID\b/i);
  expect(output).toMatch(/\bName\b/i);
  expect(output).toMatch(/\bOwner\b/i);

  expect(answer.trim().length).toBeGreaterThan(0);
  expect(answer).toMatch(
    /project|configured|configuration|framework|root|build|output|install/i
  );
});
