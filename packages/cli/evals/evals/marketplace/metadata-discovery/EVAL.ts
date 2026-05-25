import { test, expect } from 'vitest';
import { readFileSync } from 'fs';

function getShellCommands(): { command: string; success: boolean }[] {
  const results = JSON.parse(
    readFileSync('__agent_eval__/results.json', 'utf-8')
  );
  return results.o11y?.shellCommands ?? [];
}

test('agent used CLI help or discovery commands for integration metadata', () => {
  const commands = getShellCommands();
  const helpCommands = commands.filter(
    c =>
      /\b(vercel|vc)\s+(integration\s+add|install)\b.*--help\b/.test(
        c.command
      ) || /\b(vercel|vc)\s+integration\s+(discover|list)\b/.test(c.command)
  );
  expect(helpCommands.length).toBeGreaterThan(0);
});

test('agent queried metadata for neon', () => {
  const commands = getShellCommands();
  const neonCommands = commands.filter(c => /\bneon\b/i.test(c.command));
  expect(neonCommands.length).toBeGreaterThan(0);
});

test('agent queried metadata for upstash', () => {
  const commands = getShellCommands();
  const upstashCommands = commands.filter(c => /\bupstash\b/i.test(c.command));
  expect(upstashCommands.length).toBeGreaterThan(0);
});
