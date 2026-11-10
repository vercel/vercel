import { existsSync } from 'fs';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DevServer from '../../../../src/util/dev/server';
import type { VercelConfig } from '../../../../src/util/dev/types';

describe('DevServer onConfig', () => {
  let cwd: string;
  beforeEach(async () => {
    cwd = await mkdtemp(join(tmpdir(), 'vc-dev-on-config-'));
  });
  afterEach(async () => {
    await rm(cwd, { recursive: true, force: true });
  });

  function createServer(
    config: VercelConfig,
    onConfig: (c: VercelConfig) => void
  ) {
    const server = new DevServer(cwd, { onConfig });
    const internals = server as unknown as Record<string, unknown>;
    internals.sidecars = [];
    internals._address = new URL('http://localhost:3000');
    internals.exit = vi.fn(() => {
      throw new Error('`vc dev` exited while resolving the config');
    });
    internals.readJsonFile = vi.fn(async (name: string) =>
      name === 'package.json' ? null : structuredClone(config)
    );
    return server;
  }

  it('hands over the config as authored, each time it resolves', async () => {
    const rewrites = [{ source: '/a', destination: '/b' }];
    const onConfig = vi.fn();
    const server = createServer({ version: 2, rewrites }, onConfig);

    await server._getVercelConfig();
    await server._getVercelConfig();

    expect(onConfig).toHaveBeenCalledTimes(2);
    const [config] = onConfig.mock.calls[0];
    expect(config.rewrites).toEqual(rewrites);
    // Not the build plan the dev server derives from it.
    expect(config.routes).toBeUndefined();
    expect(config.builds).toBeUndefined();
  });

  describe('with --local-config', () => {
    const argv = process.argv;
    afterEach(() => {
      process.argv = argv;
    });

    it('reads only that file, without compiling vercel.ts', async () => {
      const redirects = [{ source: '/a', destination: '/b', permanent: false }];
      // Compiling this would fail every reload.
      await writeFile(join(cwd, 'vercel.ts'), 'export default {');
      await writeFile(
        join(cwd, 'vercel.dev.json'),
        JSON.stringify({ version: 2, redirects })
      );
      process.argv = [
        'node',
        'vercel',
        'dev',
        '--local-config',
        join(cwd, 'vercel.dev.json'),
      ];
      const onConfig = vi.fn();
      const server = new DevServer(cwd, { onConfig });
      const internals = server as unknown as Record<string, unknown>;
      internals.sidecars = [];
      internals._address = new URL('http://localhost:3000');
      internals.exit = vi.fn(() => {
        throw new Error('`vc dev` exited while resolving the config');
      });

      await server._getVercelConfig();

      expect(onConfig.mock.calls[0][0].redirects).toEqual(redirects);
      // Nothing compiled.
      expect(existsSync(join(cwd, '.vercel', 'vercel.json'))).toBe(false);
    });
  });
});
