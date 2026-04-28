import { readFileSync } from 'fs';
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
