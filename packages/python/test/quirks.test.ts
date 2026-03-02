import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { tmpdir } from 'os';

// Mock execa (used by prisma quirk's run(), not for dependency detection)
vi.mock('execa', () => {
  const fn = vi.fn();
  return { default: fn, __esModule: true };
});

// Mock @vercel/build-utils debug + NowBuildError
vi.mock('@vercel/build-utils', () => ({
  debug: vi.fn(),
  NowBuildError: class NowBuildError extends Error {
    code: string;
    constructor({ code, message }: { code: string; message: string }) {
      super(message);
      this.code = code;
    }
  },
}));

// Mock getVenvSitePackagesDirs and resolveVendorDir — avoids spawning Python
vi.mock('../src/install', () => ({
  getVenvSitePackagesDirs: vi.fn(),
  resolveVendorDir: vi.fn().mockReturnValue('.vercel/builders/python'),
}));

import execa from 'execa';
import { getVenvSitePackagesDirs } from '../src/install';
import { runQuirks, toposortQuirks } from '../src/quirks';
import { RUNTIME_OPENSSL_VERSION } from '../src/quirks/prisma';
import type { Quirk, QuirkContext } from '../src/quirks';

const mockedExeca = vi.mocked(execa);
const mockedGetSitePackages = vi.mocked(getVenvSitePackagesDirs);

const EXECA_OK = {
  stdout: '',
  stderr: '',
  exitCode: 0,
  command: '',
  escapedCommand: '',
  failed: false,
  timedOut: false,
  killed: false,
} as any;

describe('runQuirks', () => {
  let tmpDir: string;
  let sitePackagesDir: string;

  function makeCtx(): QuirkContext {
    const venvPath = path.join(tmpDir, '.venv');
    return {
      venvPath,
      pythonEnv: { PATH: path.join(venvPath, 'bin') },
      workPath: tmpDir,
    };
  }

  beforeEach(async () => {
    tmpDir = path.join(
      tmpdir(),
      `vc-test-quirks-${Math.floor(Math.random() * 1e6)}`
    );
    const venvPath = path.join(tmpDir, '.venv');
    const binDir = path.join(venvPath, 'bin');
    await fs.mkdirp(binDir);
    await fs.writeFile(path.join(binDir, 'python'), '');

    sitePackagesDir = path.join(venvPath, 'lib', 'python3.12', 'site-packages');
    await fs.mkdirp(sitePackagesDir);

    mockedExeca.mockReset();
    mockedGetSitePackages.mockReset();
    mockedGetSitePackages.mockResolvedValue([sitePackagesDir]);
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  it('skips quirk when dependency is not installed', async () => {
    // No prisma dist-info in site-packages → quirk should be skipped
    const result = await runQuirks(makeCtx());

    expect(result.env).toEqual({});
    expect(result.buildEnv).toEqual({});
    expect(result.alwaysBundlePackages).toEqual([]);
    // No execa calls — prisma quirk's run() was never invoked
    expect(mockedExeca).not.toHaveBeenCalled();
  });

  it('runs quirk and merges result when dependency is installed', async () => {
    // Create prisma dist-info so scanDistributions detects it
    await fs.mkdirp(path.join(sitePackagesDir, 'prisma'));
    const distInfoDir = path.join(sitePackagesDir, 'prisma-0.13.0.dist-info');
    await fs.mkdirp(distInfoDir);
    await fs.writeFile(
      path.join(distInfoDir, 'METADATA'),
      'Metadata-Version: 2.1\nName: prisma\nVersion: 0.13.0\n'
    );
    await fs.writeFile(
      path.join(distInfoDir, 'RECORD'),
      'prisma/__init__.py,,\n'
    );

    // prisma quirk's run() calls execa for prisma generate — since execa is
    // mocked we need to simulate the engine binary that `prisma generate`
    // would download into the cache's node_modules/prisma/ directory.
    const cacheDir = path.join(sitePackagesDir, 'prisma', '__bincache__');
    const binaryTarget =
      process.arch === 'arm64'
        ? 'query-engine-linux-arm64-openssl-3.0.x'
        : 'query-engine-rhel-openssl-3.0.x';
    const engineDir = path.join(cacheDir, 'node_modules', 'prisma');
    await fs.mkdirp(engineDir);
    await fs.writeFile(path.join(engineDir, binaryTarget), 'fake-engine');

    mockedExeca.mockResolvedValue(EXECA_OK);

    const result = await runQuirks(makeCtx());

    // Verify env vars point to the runtime cache directory
    expect(result.env).toMatchObject({
      PRISMA_BINARY_CACHE_DIR: expect.stringContaining('prisma/__bincache__'),
      VERCEL_RUNTIME_ENV_PATH_PREPEND: expect.stringContaining(
        'prisma/__bincache__'
      ),
    });
    expect(result.buildEnv).toMatchObject({
      PRISMA_BINARY_CACHE_DIR: cacheDir,
    });
    expect(result.alwaysBundlePackages).toEqual(['prisma']);

    // Verify engine binary was renamed to the runtime name
    const runtimeName = `prisma-query-engine-rhel-openssl-${RUNTIME_OPENSSL_VERSION}.x`;
    expect(await fs.pathExists(path.join(cacheDir, runtimeName))).toBe(true);

    // Verify openssl shim was created
    expect(await fs.pathExists(path.join(cacheDir, 'openssl'))).toBe(true);
  });

  it('litellm quirk runs before prisma and propagates buildEnv', async () => {
    // Create dist-info for both litellm and prisma-client-py
    await fs.mkdirp(path.join(sitePackagesDir, 'prisma'));
    const prismaDistInfo = path.join(
      sitePackagesDir,
      'prisma-0.13.0.dist-info'
    );
    await fs.mkdirp(prismaDistInfo);
    await fs.writeFile(
      path.join(prismaDistInfo, 'METADATA'),
      'Metadata-Version: 2.1\nName: prisma\nVersion: 0.13.0\n'
    );
    await fs.writeFile(
      path.join(prismaDistInfo, 'RECORD'),
      'prisma/__init__.py,,\n'
    );

    const litellmDistInfo = path.join(
      sitePackagesDir,
      'litellm-1.0.0.dist-info'
    );
    await fs.mkdirp(litellmDistInfo);
    await fs.writeFile(
      path.join(litellmDistInfo, 'METADATA'),
      'Metadata-Version: 2.1\nName: litellm\nVersion: 1.0.0\n'
    );
    await fs.writeFile(
      path.join(litellmDistInfo, 'RECORD'),
      'litellm/__init__.py,,\n'
    );

    // Create the litellm schema file
    const schemaDir = path.join(sitePackagesDir, 'litellm', 'proxy');
    await fs.mkdirp(schemaDir);
    const schemaPath = path.join(schemaDir, 'schema.prisma');
    await fs.writeFile(schemaPath, 'datasource db { provider = "sqlite" }');

    // Pre-create the engine binary that prisma quirk expects after `prisma generate`
    const cacheDir = path.join(sitePackagesDir, 'prisma', '__bincache__');
    const binaryTarget =
      process.arch === 'arm64'
        ? 'query-engine-linux-arm64-openssl-3.0.x'
        : 'query-engine-rhel-openssl-3.0.x';
    const engineDir = path.join(cacheDir, 'node_modules', 'prisma');
    await fs.mkdirp(engineDir);
    await fs.writeFile(path.join(engineDir, binaryTarget), 'fake-engine');

    // prisma quirk's run() calls execa
    mockedExeca.mockResolvedValue(EXECA_OK);

    // Save original PRISMA_SCHEMA_PATH to restore later
    const origSchemaPath = process.env.PRISMA_SCHEMA_PATH;

    try {
      delete process.env.PRISMA_SCHEMA_PATH;
      const result = await runQuirks(makeCtx());

      // litellm quirk should have set PRISMA_SCHEMA_PATH in buildEnv
      expect(result.buildEnv!.PRISMA_SCHEMA_PATH).toBe(schemaPath);
      // And propagated it to process.env for prisma quirk to pick up
      expect(process.env.PRISMA_SCHEMA_PATH).toBe(schemaPath);
    } finally {
      if (origSchemaPath !== undefined) {
        process.env.PRISMA_SCHEMA_PATH = origSchemaPath;
      } else {
        delete process.env.PRISMA_SCHEMA_PATH;
      }
    }
  });

  describe('litellm CONFIG_FILE_PATH', () => {
    async function installLitellm() {
      const distInfo = path.join(sitePackagesDir, 'litellm-1.0.0.dist-info');
      await fs.mkdirp(distInfo);
      await fs.writeFile(
        path.join(distInfo, 'METADATA'),
        'Metadata-Version: 2.1\nName: litellm\nVersion: 1.0.0\n'
      );
      await fs.writeFile(
        path.join(distInfo, 'RECORD'),
        'litellm/__init__.py,,\n'
      );
    }

    it('sets CONFIG_FILE_PATH when config file exists in workPath', async () => {
      await installLitellm();
      await fs.writeFile(
        path.join(tmpDir, 'litellm_config.yaml'),
        'model_list: []'
      );

      const origConfigPath = process.env.CONFIG_FILE_PATH;
      try {
        delete process.env.CONFIG_FILE_PATH;
        const result = await runQuirks(makeCtx());

        expect(result.buildEnv!.CONFIG_FILE_PATH).toBe(
          path.join(tmpDir, 'litellm_config.yaml')
        );
        expect(result.env!.CONFIG_FILE_PATH).toBe(
          '/var/task/litellm_config.yaml'
        );
      } finally {
        if (origConfigPath !== undefined) {
          process.env.CONFIG_FILE_PATH = origConfigPath;
        } else {
          delete process.env.CONFIG_FILE_PATH;
        }
      }
    });

    it('respects existing CONFIG_FILE_PATH env var', async () => {
      await installLitellm();
      await fs.writeFile(
        path.join(tmpDir, 'litellm_config.yaml'),
        'model_list: []'
      );

      const origConfigPath = process.env.CONFIG_FILE_PATH;
      try {
        process.env.CONFIG_FILE_PATH = '/custom/config.yaml';
        const result = await runQuirks(makeCtx());

        // Should not override the existing env var
        expect(result.buildEnv!.CONFIG_FILE_PATH).toBeUndefined();
        expect(result.env!.CONFIG_FILE_PATH).toBeUndefined();
      } finally {
        if (origConfigPath !== undefined) {
          process.env.CONFIG_FILE_PATH = origConfigPath;
        } else {
          delete process.env.CONFIG_FILE_PATH;
        }
      }
    });

    it('does not set CONFIG_FILE_PATH when no config file exists', async () => {
      await installLitellm();

      const origConfigPath = process.env.CONFIG_FILE_PATH;
      try {
        delete process.env.CONFIG_FILE_PATH;
        const result = await runQuirks(makeCtx());

        expect(result.buildEnv!.CONFIG_FILE_PATH).toBeUndefined();
        expect(result.env!.CONFIG_FILE_PATH).toBeUndefined();
      } finally {
        if (origConfigPath !== undefined) {
          process.env.CONFIG_FILE_PATH = origConfigPath;
        } else {
          delete process.env.CONFIG_FILE_PATH;
        }
      }
    });

    it('picks first matching config candidate by priority', async () => {
      await installLitellm();
      // Create both litellm.yaml and litellm_config.yaml —
      // litellm_config.yaml should win because it comes first in CONFIG_CANDIDATES
      await fs.writeFile(path.join(tmpDir, 'litellm.yaml'), 'model_list: []');
      await fs.writeFile(
        path.join(tmpDir, 'litellm_config.yaml'),
        'model_list: []'
      );

      const origConfigPath = process.env.CONFIG_FILE_PATH;
      try {
        delete process.env.CONFIG_FILE_PATH;
        const result = await runQuirks(makeCtx());

        expect(result.buildEnv!.CONFIG_FILE_PATH).toBe(
          path.join(tmpDir, 'litellm_config.yaml')
        );
        expect(result.env!.CONFIG_FILE_PATH).toBe(
          '/var/task/litellm_config.yaml'
        );
      } finally {
        if (origConfigPath !== undefined) {
          process.env.CONFIG_FILE_PATH = origConfigPath;
        } else {
          delete process.env.CONFIG_FILE_PATH;
        }
      }
    });
  });
});

describe('toposortQuirks', () => {
  function makeQuirk(
    dependency: string,
    opts?: { runsBefore?: string[]; runsAfter?: string[] }
  ): Quirk {
    return {
      dependency,
      runsBefore: opts?.runsBefore,
      runsAfter: opts?.runsAfter,
      run: vi.fn().mockResolvedValue({}),
    };
  }

  it('sorts quirk with runsBefore before the referenced quirk', () => {
    const a = makeQuirk('a', { runsBefore: ['b'] });
    const b = makeQuirk('b');
    const sorted = toposortQuirks([b, a]);
    expect(sorted.indexOf(a)).toBeLessThan(sorted.indexOf(b));
  });

  it('sorts quirk with runsAfter after the referenced quirk', () => {
    const a = makeQuirk('a');
    const b = makeQuirk('b', { runsAfter: ['a'] });
    const sorted = toposortQuirks([b, a]);
    expect(sorted.indexOf(a)).toBeLessThan(sorted.indexOf(b));
  });

  it('silently ignores references to non-activated quirks', () => {
    const a = makeQuirk('a', { runsBefore: ['nonexistent'] });
    const b = makeQuirk('b');
    // Should not throw
    const sorted = toposortQuirks([a, b]);
    expect(sorted).toHaveLength(2);
  });

  it('throws on circular dependencies', () => {
    const a = makeQuirk('a', { runsBefore: ['b'] });
    const b = makeQuirk('b', { runsBefore: ['a'] });
    expect(() => toposortQuirks([a, b])).toThrow(/Circular dependency/);
  });
});
