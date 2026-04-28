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

test('agent used vercel list', () => {
  const commands = getShellCommands();
  const listCommands = commands.filter(command =>
    /\b(vercel|vc)\s+(ls|list)\b/.test(command)
  );

  expect(listCommands.length).toBeGreaterThan(0);
});
