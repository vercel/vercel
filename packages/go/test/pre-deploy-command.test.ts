import fs from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { mkdirp, remove, copy } from 'fs-extra';
import { build } from '../src';
import type { BuildOptions, Files } from '@vercel/build-utils';

describe('preDeployCommand', () => {
  const testDir = join(tmpdir(), 'vercel-go-test-predeploy');
  const fixtureDir = join(__dirname, 'fixtures/35-build-command-server');

  beforeEach(async () => {
    await remove(testDir);
    await mkdirp(testDir);
    // Copy the fixture into a writable temp directory
    await copy(fixtureDir, testDir);
  });

  afterEach(async () => {
    await remove(testDir);
  });

  it('registers the preDeployCommand callback when provided', async () => {
    let registeredCallback: (() => Promise<void>) | undefined;

    const files: Files = {};
    const entries = await fs.promises.readdir(testDir);
    for (const entry of entries) {
      const stat = await fs.promises.stat(join(testDir, entry));
      if (stat.isFile()) {
        files[entry] = {
          type: 'FileFsRef' as const,
          mode: stat.mode,
          fsPath: join(testDir, entry),
          toStreamAsync: () => {
            throw new Error('not implemented');
          },
        } as any;
      }
    }

    const options: BuildOptions = {
      files,
      entrypoint: 'main.go',
      workPath: testDir,
      repoRootPath: testDir,
      config: {
        framework: 'go',
        preDeployCommand: 'touch pre-deploy-ran.txt',
      },
      meta: { skipDownload: true },
      registerPreDeploy: (cb: () => Promise<void>) => {
        registeredCallback = cb;
      },
    };

    await build(options);

    expect(registeredCallback).toBeDefined();

    // Execute the callback and verify side effect
    await registeredCallback!();
    expect(
      await fs.promises
        .access(join(testDir, 'pre-deploy-ran.txt'))
        .then(() => true)
        .catch(() => false)
    ).toBe(true);
  });

  it('does not register callback when preDeployCommand is absent', async () => {
    let registeredCallback: (() => Promise<void>) | undefined;

    const files: Files = {};
    const entries = await fs.promises.readdir(testDir);
    for (const entry of entries) {
      const stat = await fs.promises.stat(join(testDir, entry));
      if (stat.isFile()) {
        files[entry] = {
          type: 'FileFsRef' as const,
          mode: stat.mode,
          fsPath: join(testDir, entry),
          toStreamAsync: () => {
            throw new Error('not implemented');
          },
        } as any;
      }
    }

    const options: BuildOptions = {
      files,
      entrypoint: 'main.go',
      workPath: testDir,
      repoRootPath: testDir,
      config: {
        framework: 'go',
      },
      meta: { skipDownload: true },
      registerPreDeploy: (cb: () => Promise<void>) => {
        registeredCallback = cb;
      },
    };

    await build(options);

    expect(registeredCallback).toBeUndefined();
  });
});
