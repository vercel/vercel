import { readFileSync, existsSync } from 'fs';
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
 * env pull eval: agent pulls env vars to a file and records the command.
 */
test('project is linked', () => {
  expect(
    existsSync('.vercel/project.json') || existsSync('.vercel/config.json')
  ).toBe(true);
});

test('agent used vercel env pull', () => {
  const commands = getShellCommands();
  expect(commands.length).toBeGreaterThan(0);

  const envPullCommands = commands.filter(command =>
    /\b(vercel|vc)\s+env\s+pull\b/.test(command)
  );
  expect(envPullCommands.length).toBeGreaterThan(0);
});

test('an env file was created', () => {
  // Common filenames from env pull (default .env.local or user-specified)
  const candidates = ['.env.local', '.env', '.env.development'];
  const found = candidates.some(f => existsSync(f));
  expect(found).toBe(true);
});

test('pulled env file contains at least one env var', () => {
  const candidates = ['.env.local', '.env', '.env.development'];
  const path = candidates.find(f => existsSync(f));
  expect(path).toBeDefined();
  const content = readFileSync(path!, 'utf-8');
  // At least one line that looks like KEY=value (optional value)
  const hasKeyValue = content
    .split('\n')
    .some(line => /^\s*[A-Za-z_][A-Za-z0-9_]*\s*=/.test(line));
  expect(hasKeyValue).toBe(true);
});
