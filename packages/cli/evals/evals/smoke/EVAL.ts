import { expect, test } from 'vitest';
import { readFileSync } from 'node:fs';

test('build completed successfully', () => {
  const results = JSON.parse(
    readFileSync('__agent_eval__/results.json', 'utf-8')
  );
  const commands = results.o11y.shellCommands.map(
    (c: { command: string }) => c.command
  );
  expect(commands).toContain('vc whoami');
  expect(commands).toContain('vc projects list');
});
