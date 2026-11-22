import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Api } from '../../fixtures/api';

// Shared setup for the env tests. Env vars have no persisting factory
// (users/schrockn/objectives/cli-testserver-tier/updates/
// 2026-10-19-factory-paths-and-storage.md), so tests seed them through the API.

export interface EnvVar {
  id: string;
  key: string;
  type: string;
  target: string[];
}

/** Write `.vercel/project.json` so the CLI treats `dir` as linked. */
export function linkDir(
  dir: string,
  link: { projectId: string; orgId: string }
): void {
  mkdirSync(join(dir, '.vercel'), { recursive: true });
  writeFileSync(join(dir, '.vercel', 'project.json'), JSON.stringify(link));
}

/** Create a readable (`encrypted`) env var through the API. */
export async function seedEnv(
  api: Api,
  projectId: string,
  env: { key: string; value: string; target: string[] }
): Promise<void> {
  await api(`/v10/projects/${projectId}/env`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...env, type: 'encrypted' }),
  });
}

/**
 * List the project's env vars. Values come back encrypted even with
 * `?decrypt=true`, so check values with `pulledEnv` instead.
 */
export async function listEnv(api: Api, projectId: string): Promise<EnvVar[]> {
  const body = await api<{ envs: EnvVar[] }>(`/v10/projects/${projectId}/env`);
  return body.envs;
}

/** Plaintext values for one target, from the endpoint `env pull` uses. */
export async function pulledEnv(
  api: Api,
  projectId: string,
  target: string
): Promise<Record<string, string>> {
  const body = await api<{ env: Record<string, string> }>(
    `/v3/env/pull/${projectId}/${target}`
  );
  return body.env;
}
