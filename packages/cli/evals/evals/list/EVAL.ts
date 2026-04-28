import { existsSync, readFileSync } from 'fs';
import { test, expect } from 'vitest';

type DeploymentListOutput =
  | Array<unknown>
  | {
      deployments?: unknown[];
      pagination?: unknown;
      error?: unknown;
    };

function getShellCommands(): string[] {
  const results = JSON.parse(
    readFileSync('__agent_eval__/results.json', 'utf-8')
  ) as {
    o11y?: { shellCommands?: Array<{ command: string }> };
  };

  return (results.o11y?.shellCommands ?? []).map(c => c.command);
}

test('agent used vercel list', () => {
  const commands = getShellCommands();
  const listCommands = commands.filter(command =>
    /\b(vercel|vc)\s+(ls|list)\b/.test(command)
  );

  expect(listCommands.length).toBeGreaterThan(0);
  expect(
    listCommands.some(
      command =>
        command.includes('--format=json') ||
        /--format\s+json\b/.test(command) ||
        command.includes('--json')
    )
  ).toBe(true);
});

test('agent saved deployment list JSON output', () => {
  expect(existsSync('deployment-list-output.json')).toBe(true);
  const output = JSON.parse(
    readFileSync('deployment-list-output.json', 'utf-8')
  ) as DeploymentListOutput;

  if (Array.isArray(output)) {
    return;
  }

  expect(output.error).toBeUndefined();
  expect(Array.isArray(output.deployments)).toBe(true);
});
