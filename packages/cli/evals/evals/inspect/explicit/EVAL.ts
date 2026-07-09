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
    /\b(vercel|vc)\s+deploy\b/.test(command)
  );
  const inspectCommands = commands.filter(command =>
    /\b(vercel|vc)\s+inspect\b/.test(command)
  );

  expect(deployCommands.length).toBeGreaterThan(0);
  expect(inspectCommands.length).toBeGreaterThan(0);
});

test('agent saved deployment URL and inspect output', () => {
  expect(existsSync('inspect-deployment-url.txt')).toBe(true);
  expect(existsSync('inspect-output.txt')).toBe(true);

  const deployment = readFileSync('inspect-deployment-url.txt', 'utf-8').trim();
  const output = readFileSync('inspect-output.txt', 'utf-8');

  expect(deployment.length).toBeGreaterThan(0);
  expect(output.trim().length).toBeGreaterThan(0);
  expect(/deployment|inspect|ready|building|error|url/i.test(output)).toBe(
    true
  );
});
