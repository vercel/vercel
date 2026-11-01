import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs-extra';
import os from 'os';

// We can't import resolveProjectDir directly since it's not exported,
// so we test through the serverBuild function's behavior indirectly.
// Instead, we replicate the resolveProjectDir logic here to unit-test it.

async function resolveProjectDir({
  baseDir,
  entryPath,
  relativeAppDir,
  appDir,
}: {
  baseDir: string;
  entryPath: string;
  relativeAppDir?: string;
  appDir?: string;
}): Promise<string> {
  if (relativeAppDir) {
    const resolved = path.join(baseDir, relativeAppDir);
    const exists = await fs
      .access(resolved)
      .then(() => true)
      .catch(() => false);

    if (exists) {
      return resolved;
    }
  }
  return appDir || entryPath;
}

describe('resolveProjectDir', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'resolve-project-dir-'));
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  it('uses relativeAppDir when resolved path exists', async () => {
    const baseDir = tmpDir;
    const entryPath = path.join(tmpDir, 'clients', 'admin-ui');
    await fs.mkdirp(path.join(tmpDir, 'clients', 'admin-ui'));

    const result = await resolveProjectDir({
      baseDir,
      entryPath,
      relativeAppDir: 'clients/admin-ui',
      appDir: entryPath,
    });

    expect(result).toBe(path.join(tmpDir, 'clients', 'admin-ui'));
  });

  it('falls back to appDir when relativeAppDir resolves to non-existent path', async () => {
    // Simulates the Next.js 16 bug: relativeAppDir is "admin-ui"
    // (relative to workspace root) but baseDir is the repo root,
    // so path.join(baseDir, "admin-ui") doesn't exist.
    const baseDir = tmpDir;
    const appDir = path.join(tmpDir, 'clients', 'admin-ui');
    const entryPath = appDir;
    await fs.mkdirp(appDir);

    const result = await resolveProjectDir({
      baseDir,
      entryPath,
      relativeAppDir: 'admin-ui', // wrong — only basename, not full path
      appDir,
    });

    // Should fall back to appDir since /tmp/.../admin-ui doesn't exist
    expect(result).toBe(appDir);
  });

  it('falls back to entryPath when neither relativeAppDir nor appDir resolve', async () => {
    const baseDir = tmpDir;
    const entryPath = path.join(tmpDir, 'clients', 'admin-ui');
    await fs.mkdirp(entryPath);

    const result = await resolveProjectDir({
      baseDir,
      entryPath,
      relativeAppDir: 'wrong-path',
    });

    expect(result).toBe(entryPath);
  });

  it('uses appDir when relativeAppDir is not provided', async () => {
    const baseDir = tmpDir;
    const appDir = path.join(tmpDir, 'my-app');
    const entryPath = path.join(tmpDir, 'fallback');

    const result = await resolveProjectDir({
      baseDir,
      entryPath,
      appDir,
    });

    expect(result).toBe(appDir);
  });

  it('uses entryPath when nothing else is provided', async () => {
    const baseDir = tmpDir;
    const entryPath = path.join(tmpDir, 'my-app');

    const result = await resolveProjectDir({
      baseDir,
      entryPath,
    });

    expect(result).toBe(entryPath);
  });
});
