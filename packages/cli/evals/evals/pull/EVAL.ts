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

test('agent used vercel pull', () => {
  const commands = getShellCommands();
  const pullCommands = commands.filter(command =>
    /\b(vercel|vc)\s+pull\b/.test(command)
  );

  expect(pullCommands.length).toBeGreaterThan(0);
  expect(
    pullCommands.some(
      command =>
        command.includes('--yes') ||
        /\s-y(\s|$)/.test(command) ||
        command.includes('--environment')
    )
  ).toBe(true);
});

test('project settings and environment file were pulled', () => {
  expect(existsSync('.vercel/project.json')).toBe(true);
  expect(existsSync('.vercel/.env.development.local')).toBe(true);
});
