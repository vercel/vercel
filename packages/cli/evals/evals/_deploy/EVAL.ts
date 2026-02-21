import { spawnSync } from 'child_process';
import { existsSync, readdirSync } from 'fs';
import path from 'path';
import { test, expect } from 'vitest';
import dotenv from 'dotenv';

dotenv.config();

test('build completed successfully', () => {
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
  const projectInspect = spawnSync(
    'vercel',
    [
      'project',
      'inspect',
      '--scope',
      'agentic-zero-conf',
      '--token',
      process.env.VERCEL_TOKEN ?? '',
    ],
    {
      cwd: fixtureFolder.name,
      env: process.env,
      encoding: 'utf-8',
    }
  );
  expect(projectInspect.stderr).toContain('Hono');
});
