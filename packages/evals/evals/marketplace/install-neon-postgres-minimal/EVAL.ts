import { test, expect } from 'vitest';
import { execSync } from 'child_process';
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
    } catch {
      // Auth file not found or unreadable; try next location
    }
  }

  // Fall back to extracting from .bashrc
  try {
    const bashrc = readFileSync('/home/vercel-sandbox/.bashrc', 'utf-8');
    const match = bashrc.match(/export VERCEL_TOKEN="([^"]+)"/);
    if (match) return match[1];
  } catch {
    // .bashrc not found or unreadable
  }

  throw new Error('No Vercel auth token found');
}

function getScope(): string {
  // Read team/org ID from .vercel/project.json for --scope flag
  try {
    const project = JSON.parse(readFileSync('.vercel/project.json', 'utf-8'));
    if (project.orgId) return `--scope ${project.orgId}`;
  } catch {
    // project.json not found; omit --scope
  }
  return '';
}

function run(cmd: string): string {
  const token = getToken();
  const scope = getScope();
  return execSync(`${cmd} --token="${token}" ${scope}`, {
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
