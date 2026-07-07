import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  mkdtempSync,
  removeSync,
  mkdirpSync,
  writeFileSync,
  writeJSONSync,
} from 'fs-extra';
import { client } from '../../../mocks/client';
import version from '../../../../src/commands/version';
import {
  STORE_FORMAT,
  readPointer,
  writePointer,
  getVersionDir,
  getStoreEntrypoint,
} from '../../../../src/util/cli-store';

let root: string;

function seedVersion(v: string) {
  const dir = getVersionDir(v, root);
  mkdirpSync(join(dir, 'dist'));
  writeFileSync(getStoreEntrypoint(v, root), '// entry');
  writeJSONSync(join(dir, 'package.json'), { name: 'vercel', version: v });
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'vc-version-test-'));
  process.env.VERCEL_CLI_STORE_DIR = root;
});

afterEach(() => {
  delete process.env.VERCEL_CLI_STORE_DIR;
  removeSync(root);
});

describe('version', () => {
  describe('status (no subcommand)', () => {
    it('reports not enrolled when there is no store', async () => {
      client.setArgv('version');
      const exitCode = await version(client);
      expect(exitCode).toBe(0);
      await expect(client.stderr).toOutput('Managed store: not enrolled');
    });

    it('reports the pointer when enrolled', async () => {
      seedVersion('54.19.0');
      writePointer(
        { storeFormat: STORE_FORMAT, version: '54.19.0', type: 'npm' },
        root
      );
      client.setArgv('version');
      const exitCode = await version(client);
      expect(exitCode).toBe(0);
      await expect(client.stderr).toOutput('Managed store: v54.19.0 (npm)');
    });

    it('reports pinned state', async () => {
      seedVersion('54.17.0');
      writePointer(
        {
          storeFormat: STORE_FORMAT,
          version: '54.17.0',
          type: 'npm',
          pinned: true,
        },
        root,
        { force: true }
      );
      client.setArgv('version');
      const exitCode = await version(client);
      expect(exitCode).toBe(0);
      await expect(client.stderr).toOutput(
        'Managed store: v54.17.0 (npm, pinned)'
      );
    });
  });

  describe('pin', () => {
    it('requires a specifier', async () => {
      client.setArgv('version', 'pin');
      const exitCode = await version(client);
      expect(exitCode).toBe(2);
      await expect(client.stderr).toOutput('A version specifier is required');
    });

    it('rejects a non-semver, non-URL specifier', async () => {
      client.setArgv('version', 'pin', 'not-a-version');
      const exitCode = await version(client);
      expect(exitCode).toBe(2);
      await expect(client.stderr).toOutput('is not a valid version');
    });

    it('rejects --binary with a tarball URL', async () => {
      client.setArgv(
        'version',
        'pin',
        'https://example.com/vercel.tgz',
        '--binary'
      );
      const exitCode = await version(client);
      expect(exitCode).toBe(2);
      await expect(client.stderr).toOutput(
        '--binary cannot be combined with a tarball URL'
      );
    });
  });

  describe('unpin', () => {
    it('is a no-op when not enrolled', async () => {
      client.setArgv('version', 'unpin');
      const exitCode = await version(client);
      expect(exitCode).toBe(0);
      await expect(client.stderr).toOutput('Not enrolled in the managed store');
    });

    it('is a no-op when not pinned', async () => {
      writePointer(
        { storeFormat: STORE_FORMAT, version: '54.19.0', type: 'npm' },
        root
      );
      client.setArgv('version', 'unpin');
      const exitCode = await version(client);
      expect(exitCode).toBe(0);
      await expect(client.stderr).toOutput('Not pinned');
    });

    it('clears the pin', async () => {
      writePointer(
        {
          storeFormat: STORE_FORMAT,
          version: '54.17.0',
          type: 'npm',
          pinned: true,
        },
        root,
        { force: true }
      );
      client.setArgv('version', 'unpin');
      const exitCode = await version(client);
      expect(exitCode).toBe(0);
      expect(readPointer(root)?.pinned).toBeUndefined();
      expect(readPointer(root)?.version).toBe('54.17.0');
    });
  });

  describe('list', () => {
    it('reports not enrolled when there is no store', async () => {
      client.setArgv('version', 'list');
      const exitCode = await version(client);
      expect(exitCode).toBe(0);
      await expect(client.stderr).toOutput('Not enrolled in the managed store');
    });

    it('lists versions and marks the current one', async () => {
      seedVersion('54.18.0');
      seedVersion('54.19.0');
      writePointer(
        { storeFormat: STORE_FORMAT, version: '54.19.0', type: 'npm' },
        root
      );
      client.setArgv('version', 'ls');
      const exitCode = await version(client);
      expect(exitCode).toBe(0);
      const out = client.stderr.getFullOutput();
      expect(out).toContain('v54.18.0');
      expect(out).toContain('v54.19.0 ← current');
    });
  });

  describe('reset', () => {
    it('is a no-op when not enrolled', async () => {
      client.setArgv('version', 'reset');
      const exitCode = await version(client);
      expect(exitCode).toBe(0);
      await expect(client.stderr).toOutput('Not enrolled in the managed store');
    });

    it('removes the store', async () => {
      seedVersion('54.19.0');
      writePointer(
        { storeFormat: STORE_FORMAT, version: '54.19.0', type: 'npm' },
        root
      );
      client.setArgv('version', 'reset');
      const exitCode = await version(client);
      expect(exitCode).toBe(0);
      expect(readPointer(root)).toBeUndefined();
      await expect(client.stderr).toOutput('Managed store removed');
    });
  });

  it('rejects unknown subcommands', async () => {
    client.setArgv('version', 'bogus');
    const exitCode = await version(client);
    expect(exitCode).toBe(2);
    await expect(client.stderr).toOutput('Unknown subcommand: bogus');
  });
});
