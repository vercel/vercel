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

/**
 * vc curl eval: we expect the agent to have run `vc curl` successfully
 * with non-interactive flags, as observed from the recorded shell commands.
 */
test('agent ran vc curl', () => {
  const commands = getShellCommands();
  expect(commands.length).toBeGreaterThan(0);

  const curlCommands = commands.filter(command =>
    /\b(vercel|vc)\s+curl\b/.test(command)
  );
  expect(curlCommands.length).toBeGreaterThan(0);
});
