import { test, expect } from 'vitest';
import { execSync } from 'child_process';

function run(cmd: string): string {
  // Source .bashrc to get VERCEL_TOKEN, then run the command
  return execSync(`bash -c 'source ~/.bashrc 2>/dev/null; ${cmd}'`, {
    encoding: 'utf-8',
    stdio: 'pipe',
  }).trim();
}

test('neon integration is installed with resource "my-test-db"', () => {
  const output = run('vercel integration list');
  expect(output.toLowerCase()).toContain('neon');
  expect(output).toContain('my-test-db');
});

test('DATABASE_URL env var exists for development', () => {
  const output = run('vercel env ls development');
  expect(output).toContain('DATABASE_URL');
});
