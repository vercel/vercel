import { test, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';

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

test('agent used a discovery approach (list, discover, or help)', () => {
  const commands = getShellCommands();
  const discoveryCommands = commands.filter(
    c =>
      /\b(vercel|vc)\s+(integration\s+(list|discover)|install)\b/i.test(
        c.command
      ) || /\b(vercel|vc)\b.*--help\b/.test(c.command)
  );
  expect(discoveryCommands.length).toBeGreaterThan(0);
});

test('agent found at least one postgres integration and wrote results', () => {
  expect(existsSync('postgres-integrations.txt')).toBe(true);
  const content = readFileSync('postgres-integrations.txt', 'utf-8')
    .toLowerCase()
    .trim();
  expect(content.length).toBeGreaterThan(0);
  // Neon is the primary PostgreSQL integration on Vercel
  expect(content).toContain('neon');
});
