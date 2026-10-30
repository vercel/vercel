import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getCliPath } from '../../helpers/get-cli-path';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('getCliPath', () => {
  const defaultPath = fileURLToPath(
    new URL('../../../scripts/start.js', import.meta.url)
  );

  it('uses the JS CLI when no binary override is configured', () => {
    vi.stubEnv('VERCEL_CLI_TEST_BINARY', undefined);
    expect(getCliPath()).toBe(defaultPath);
  });

  it('uses the JS CLI when the override is empty', () => {
    vi.stubEnv('VERCEL_CLI_TEST_BINARY', '');
    expect(getCliPath()).toBe(defaultPath);
  });

  it('uses the configured absolute binary path', () => {
    const binaryPath = resolve('dist-bin/vercel-linux-x64');
    vi.stubEnv('VERCEL_CLI_TEST_BINARY', binaryPath);
    expect(getCliPath()).toBe(binaryPath);
  });

  it('resolves relative binary paths against the test runner cwd', () => {
    vi.stubEnv('VERCEL_CLI_TEST_BINARY', 'dist-bin/vercel-linux-x64');
    expect(getCliPath()).toBe(resolve('dist-bin/vercel-linux-x64'));
  });
});
