import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';

const originalArgv = process.argv;

afterEach(() => {
  process.argv = originalArgv;
  vi.resetModules();
});

describe('config file paths', () => {
  it('resolves --global-config from the argv present at first use, not at import', async () => {
    process.argv = ['node', 'vercel', '--internal-build-worker'];
    const files = await import('../../../../src/util/config/files');

    process.argv = ['node', 'vercel', 'build', '--global-config', '/tmp/gc'];

    expect(files.getConfigFilePath()).toBe(
      path.join(path.resolve('/tmp/gc'), 'config.json')
    );
    expect(files.getAuthConfigFilePath()).toBe(
      path.join(path.resolve('/tmp/gc'), 'auth.json')
    );
  });
});
