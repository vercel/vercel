import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, describe, expect, it } from 'vitest';
import {
  getLocalVercelEnvFilePath,
  loadLocalVercelEnvFile,
} from '../../../../src/util/env/load-local-vercel-env';

describe('loadLocalVercelEnvFile', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) {
      try {
        require('fs').rmSync(dir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
    tempDirs.length = 0;
  });

  it('loads variables from .vercel/.env.preview.local', async () => {
    const cwd = join(tmpdir(), `vercel-env-${Date.now()}`);
    tempDirs.push(cwd);
    const envDir = join(cwd, '.vercel');
    mkdirSync(envDir, { recursive: true });
    writeFileSync(
      join(envDir, '.env.preview.local'),
      '# Created by Vercel CLI\nSANITY_STUDIO_SK="secret-value"\n',
      'utf8'
    );

    const env = await loadLocalVercelEnvFile(cwd, 'preview');

    expect(env.SANITY_STUDIO_SK).toBe('secret-value');
  });

  it('returns an empty object when the env file does not exist', async () => {
    const cwd = join(tmpdir(), `vercel-env-missing-${Date.now()}`);
    tempDirs.push(cwd);
    mkdirSync(cwd, { recursive: true });

    const env = await loadLocalVercelEnvFile(cwd, 'preview');

    expect(env).toEqual({});
  });

  it('respects project rootDirectory when resolving the env file path', () => {
    const path = getLocalVercelEnvFilePath('/repo', 'preview', 'apps/web');

    expect(path).toBe(
      join('/repo', 'apps/web', '.vercel', '.env.preview.local')
    );
  });
});
