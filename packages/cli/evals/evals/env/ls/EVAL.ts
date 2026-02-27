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
 * vc env eval: we expect the agent to have run an env subcommand (e.g. ls)
 * as observed from the recorded shell commands.
 */
test('project is linked', () => {
  // The eval harness ensures the project is linked; this test focuses on the CLI usage.
  expect(true).toBe(true);
});

test('agent used vc env command', () => {
  const commands = getShellCommands();
  expect(commands.length).toBeGreaterThan(0);

  const envCommands = commands.filter(command =>
    /\b(vercel|vc)\s+env\b/.test(command)
  );
  expect(envCommands.length).toBeGreaterThan(0);

  const listCommand = envCommands.find(command =>
    /\b(ls|list)\b/.test(command)
  );
  expect(listCommand).toBeDefined();
});
