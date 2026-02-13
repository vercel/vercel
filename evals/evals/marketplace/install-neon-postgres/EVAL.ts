import { test, expect } from 'vitest';
import { execSync, spawnSync } from 'child_process';
import { readFileSync } from 'fs';

function getToken(): string {
  // Try reading from the Vercel CLI auth locations
  const paths = [
    '/home/vercel-sandbox/.local/share/com.vercel.cli/auth.json',
    '/home/vercel-sandbox/.vercel/auth.json',
  ];
  for (const p of paths) {
    try {
      const auth = JSON.parse(readFileSync(p, 'utf-8'));
      if (auth.token) return auth.token;
    } catch {}
  }

  // Fall back to extracting from .bashrc
  try {
    const bashrc = readFileSync('/home/vercel-sandbox/.bashrc', 'utf-8');
    const match = bashrc.match(/export VERCEL_TOKEN="([^"]+)"/);
    if (match) return match[1];
  } catch {}

  throw new Error('No Vercel auth token found');
}

function run(cmd: string): string {
  const token = getToken();
  return execSync(`${cmd} --token="${token}"`, {
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
