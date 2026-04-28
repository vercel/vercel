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

test('agent created a deployment before inspecting it', () => {
  const commands = getShellCommands();
  const deployCommands = commands.filter(command =>
    /\b(vercel|vc)(\s+deploy\b|\s+(--yes|-y)(\s|$))/.test(command)
  );
  const inspectCommands = commands.filter(command =>
    /\b(vercel|vc)\s+inspect\b/.test(command)
  );

  expect(deployCommands.length).toBeGreaterThan(0);
  expect(inspectCommands.length).toBeGreaterThan(0);
});

test('agent saved deployment target and inspect output', () => {
  expect(existsSync('deployment-url.txt')).toBe(true);
  expect(existsSync('inspect-output.txt')).toBe(true);

  const deployment = readFileSync('deployment-url.txt', 'utf-8').trim();
  const output = readFileSync('inspect-output.txt', 'utf-8');
  expect(deployment.length).toBeGreaterThan(0);
  expect(output.trim().length).toBeGreaterThan(0);
  expect(
    output.includes(deployment) ||
      /ready|building|queued|error|deployment|url/i.test(output)
  ).toBe(true);
});
