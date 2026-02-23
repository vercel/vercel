import { readFileSync, existsSync } from 'fs';
import { test, expect } from 'vitest';

/**
 * env pull eval: agent pulls env vars to a file and records the command.
 */
test('project is linked', () => {
  expect(
    existsSync('.vercel/project.json') || existsSync('.vercel/config.json')
  ).toBe(true);
});

test('agent used vercel env pull', () => {
  expect(existsSync('command-used.txt')).toBe(true);

  const command = readFileSync('command-used.txt', 'utf-8').trim();
  expect(command.length).toBeGreaterThan(0);
  expect(command).toMatch(/\b(vercel|vc)\s+env\s+pull\b/);
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
