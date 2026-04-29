import { test, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'fs';
import { getToken } from '../../../setup/get-token';

function getProjectConfig(): { projectId: string; orgId: string } {
  return JSON.parse(readFileSync('.vercel/project.json', 'utf-8'));
}

function getShellCommands(): { command: string; success: boolean }[] {
  const results = JSON.parse(
    readFileSync('__agent_eval__/results.json', 'utf-8')
  );
  return results.o11y?.shellCommands ?? [];
}

let token: string;
let projectId: string;
let orgId: string;
let headers: Record<string, string>;

beforeAll(() => {
  token = getToken();
  ({ projectId, orgId } = getProjectConfig());
  headers = { Authorization: `Bearer ${token}` };
});

afterAll(async () => {
  // Clean up Upstash stores created during the eval.
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

test('agent used the slash syntax upstash/redis', () => {
  const commands = getShellCommands();
  const slashCommands = commands.filter(c =>
    /\bupstash\/upstash-kv\b/.test(c.command)
  );
  expect(slashCommands.length).toBeGreaterThan(0);
});

test('upstash redis resource "eval-upstash-redis" exists', async () => {
  const res = await fetch(
    `https://api.vercel.com/v1/storage/stores?projectId=${projectId}&teamId=${orgId}`,
    { headers }
  );
  expect(res.ok).toBe(true);

  const data = (await res.json()) as {
    stores?: { name?: string; provider?: string }[];
  };
  const upstashStore = (data.stores ?? []).find(
    s =>
      s.name === 'eval-upstash-redis' ||
      s.provider?.toLowerCase().includes('upstash')
  );
  expect(upstashStore).toBeDefined();
});
