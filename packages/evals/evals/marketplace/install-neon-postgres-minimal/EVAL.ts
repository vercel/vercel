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

function getProjectConfig(): { projectId: string; orgId: string } {
  const raw = readFileSync('.vercel/project.json', 'utf-8');
  return JSON.parse(raw);
}

function run(cmd: string): string {
  const token = getToken();
  const { orgId } = getProjectConfig();
  return execSync(`${cmd} --token="${token}" --scope ${orgId}`, {
    encoding: 'utf-8',
    stdio: 'pipe',
  }).trim();
}

test('neon integration is installed with resource "my-test-db"', async () => {
  const token = getToken();
  const { projectId, orgId } = getProjectConfig();

  // Use the Vercel API to check for resources linked to this project
  const res = await fetch(
    `https://api.vercel.com/v1/storage/stores?projectId=${projectId}&teamId=${orgId}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  expect(res.ok).toBe(true);

  const data = await res.json();
  const stores =
    (data as { stores?: { name?: string; provider?: string }[] }).stores ?? [];
  const neonStore = stores.find(
    s => s.name === 'my-test-db' || s.provider?.toLowerCase().includes('neon')
  );
  expect(neonStore).toBeDefined();
});

test('DATABASE_URL env var exists for development', () => {
  const output = run('vercel env ls development');
  expect(output).toContain('DATABASE_URL');
});
