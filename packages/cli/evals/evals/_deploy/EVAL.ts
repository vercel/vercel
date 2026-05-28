import { spawnSync } from 'child_process';
import { existsSync, readdirSync } from 'fs';
import path from 'path';
import { test, expect } from 'vitest';
import dotenv from 'dotenv';

dotenv.config();

const INSPECT_TIMEOUT_MS = 30_000;
const INSPECT_POLL_MS = 1_000;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function inspectProject(cwd: string): string {
  const args = ['project', 'inspect', '--scope', 'agentic-zero-conf'];
  const token = process.env.VERCEL_TOKEN;
  if (token) {
    args.push('--token', token);
  }
  const result = spawnSync('vercel', args, {
    cwd,
    env: process.env,
    encoding: 'utf-8',
  });
  return result.stderr ?? '';
}

test(
  'build completed successfully',
  async () => {
    const folders = readdirSync('.', { withFileTypes: true });
    const fixtureFolder = folders.find(folder =>
      folder.name.startsWith('fixture')
    );
    if (!fixtureFolder) {
      throw new Error('Fixture folder not found');
    }
    const projectJsonExists = existsSync(
      path.join(fixtureFolder.name, '.vercel/project.json')
    );
    expect(projectJsonExists).toBe(true);

    // Framework detection lands asynchronously after deploy → READY.
    const deadline = Date.now() + INSPECT_TIMEOUT_MS;
    let lastStderr = '';
    while (Date.now() < deadline) {
      lastStderr = inspectProject(fixtureFolder.name);
      if (lastStderr.includes('Hono')) {
        return;
      }
      await sleep(INSPECT_POLL_MS);
    }
    expect(lastStderr).toContain('Hono');
  },
  INSPECT_TIMEOUT_MS + 5_000
);
