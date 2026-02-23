import { readFileSync, existsSync } from 'fs';
import { test, expect } from 'vitest';

/**
 * vc env eval: we expect the agent to have run an env subcommand (e.g. ls)
 * and recorded the command in command-used.txt.
 */
test('project is linked', () => {
  expect(
    existsSync('.vercel/project.json') || existsSync('.vercel/config.json')
  ).toBe(true);
});

test('agent used vc env command', () => {
  expect(existsSync('command-used.txt')).toBe(true);

  const command = readFileSync('command-used.txt', 'utf-8').trim();
  expect(command.length).toBeGreaterThan(0);
  expect(command).toMatch(/\b(vercel|vc)\s+env\b/);
  expect(command).toMatch(/\b(ls|list)\b/);
});
