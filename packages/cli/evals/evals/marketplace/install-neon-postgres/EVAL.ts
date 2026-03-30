import { test, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { Vercel } from '@vercel/sdk';

function getToken(): string {
  const home = homedir();
  const paths = [
    join(home, '.local/share/com.vercel.cli/auth.json'),
    join(home, '.vercel/auth.json'),
  ];
  for (const p of paths) {
    try {
      const auth = JSON.parse(readFileSync(p, 'utf-8'));
      if (auth.token) return auth.token;
    } catch {
      // Auth file not found or unreadable; try next location
    }
  }

  try {
    const bashrc = readFileSync(join(home, '.bashrc'), 'utf-8');
    const match = bashrc.match(/export VERCEL_TOKEN="([^"]+)"/);
    if (match) return match[1];
  } catch {
    // .bashrc not found or unreadable
  }

  throw new Error('No Vercel auth token found');
}

function getProjectConfig(): { projectId: string; orgId: string } {
  return JSON.parse(readFileSync('.vercel/project.json', 'utf-8'));
}

let token: string;
let projectId: string;
let orgId: string;
let vercel: Vercel;
let headers: Record<string, string>;

beforeAll(() => {
  token = getToken();
  ({ projectId, orgId } = getProjectConfig());
  vercel = new Vercel({ bearerToken: token });
  headers = { Authorization: `Bearer ${token}` };
});

afterAll(async () => {
  // Clean up Neon stores created during the eval so they don't leak.
  // Runs before the runner's destroy() deletes the ephemeral project.
  if (!token || !projectId) return;
  try {
    const res = await fetch(
      `https://api.vercel.com/v1/storage/stores?projectId=${projectId}&teamId=${orgId}`,
      { headers }
    );
    if (!res.ok) return;

    const data = (await res.json()) as {
      stores?: { id?: string; name?: string }[];
    };

    for (const store of data.stores ?? []) {
      if (!store.id) continue;
      try {
        await fetch(
          `https://api.vercel.com/v1/storage/stores/integration/${store.id}?teamId=${orgId}`,
          { method: 'DELETE', headers }
        );
      } catch {
        // Best-effort cleanup
      }
    }
  } catch {
    // Best-effort cleanup
  }
}, 60_000);

test('neon integration is installed with resource "my-test-db"', async () => {
  // The SDK doesn't expose /v1/storage/stores, so we use fetch directly
  const res = await fetch(
    `https://api.vercel.com/v1/storage/stores?projectId=${projectId}&teamId=${orgId}`,
    { headers }
  );
  expect(res.ok).toBe(true);

  const data = (await res.json()) as {
    stores?: { name?: string; provider?: string }[];
  };
  const neonStore = (data.stores ?? []).find(
    s => s.name === 'my-test-db' || s.provider?.toLowerCase().includes('neon')
  );
  expect(neonStore).toBeDefined();
});

test('DATABASE_URL env var exists for development', async () => {
  const result = await vercel.projects.filterProjectEnvs({
    idOrName: projectId,
    teamId: orgId,
  });

  // filterProjectEnvs returns a union; variants 2 & 3 have `envs`, variant 1 is a single env
  const envs: { key: string }[] =
    'envs' in result
      ? (result as { envs: { key: string }[] }).envs
      : [result as unknown as { key: string }];
  const dbUrl = envs.find(e => e.key === 'DATABASE_URL');
  expect(dbUrl).toBeDefined();
});
