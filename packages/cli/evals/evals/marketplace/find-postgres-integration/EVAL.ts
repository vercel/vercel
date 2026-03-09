import { test, expect } from 'vitest';
import { readFileSync } from 'fs';

function getShellCommands(): { command: string; success: boolean }[] {
  const results = JSON.parse(
    readFileSync('__agent_eval__/results.json', 'utf-8')
  );
  return results.o11y?.shellCommands ?? [];
}

test('agent used vercel integration or install commands', () => {
  const commands = getShellCommands();
  const integrationCommands = commands.filter(c =>
    /\b(vercel|vc)\s+(integration|install)\b/.test(c.command)
  );
  expect(integrationCommands.length).toBeGreaterThan(0);
});

test('agent used a discovery command (list or discover)', () => {
  const commands = getShellCommands();
  const discoveryCommands = commands.filter(c =>
    /\b(vercel|vc)\s+(integration\s+(list|discover)|integration\b.*--help)\b/i.test(
      c.command
    )
  );
  expect(discoveryCommands.length).toBeGreaterThan(0);
});
