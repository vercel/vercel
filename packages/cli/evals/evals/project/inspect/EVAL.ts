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

function getProjectConfig(): { projectId?: string; projectName?: string } {
  if (!existsSync('.vercel/project.json')) return {};
  return JSON.parse(readFileSync('.vercel/project.json', 'utf-8')) as {
    projectId?: string;
    projectName?: string;
  };
}

test('agent used vercel project inspect', () => {
  const commands = getShellCommands();
  const inspectCommands = commands.filter(command =>
    /\b(vercel|vc)\s+project\s+inspect\b/.test(command)
  );

  expect(inspectCommands.length).toBeGreaterThan(0);
});

test('agent saved linked project inspection output', () => {
  expect(existsSync('project-inspect.txt')).toBe(true);
  const content = readFileSync('project-inspect.txt', 'utf-8');
  expect(content.trim().length).toBeGreaterThan(0);

  const project = getProjectConfig();
  const expected = [project.projectId, project.projectName].filter(Boolean);
  if (expected.length > 0) {
    expect(expected.some(value => content.includes(value!))).toBe(true);
  }
});
