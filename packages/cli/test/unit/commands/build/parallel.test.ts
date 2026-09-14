import { beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs-extra';
import { join, relative, sep } from 'path';
import build from '../../../../src/commands/build';
import { client } from '../../../mocks/client';
import { setupUnitFixture } from '../../../helpers/setup-unit-fixture';

vi.setConfig({ testTimeout: 10 * 60 * 1000 });

const flakey =
  process.platform === 'win32' && process.version.startsWith('v22');

const SERVICES = ['frontend', 'api-a', 'api-b', 'py-a', 'py-b'];

async function buildFixture(concurrency: string): Promise<string> {
  const cwd = setupUnitFixture('commands/build/with-services-parallel');
  delete process.env.__VERCEL_BUILD_RUNNING;
  process.env.VERCEL_EXPERIMENTAL_BUILD_CONCURRENCY = concurrency;
  try {
    client.cwd = cwd;
    const exitCode = await build(client);
    expect(exitCode, `build with concurrency ${concurrency}`).toBe(0);
  } finally {
    delete process.env.VERCEL_EXPERIMENTAL_BUILD_CONCURRENCY;
  }
  return join(cwd, '.vercel', 'output');
}

async function collectConfigs(output: string): Promise<Record<string, string>> {
  const configs: Record<string, string> = {
    'config.json': await fs.readFile(join(output, 'config.json'), 'utf8'),
  };
  for (const name of SERVICES) {
    const path = join(output, 'services', name, 'config.json');
    if (await fs.pathExists(path)) {
      configs[relative(output, path)] = await fs.readFile(path, 'utf8');
    }
  }
  return configs;
}

async function listTree(dir: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (current: string): Promise<void> => {
    for (const entry of await fs.readdir(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) await walk(path);
      else
        out.push(
          relative(dir, path)
            .split(sep)
            .join('/')
            .replace(/tmp-[^/]+\/\d+\/commands\/build\//, '<fixture-copy>/')
        );
    }
  };
  await walk(dir);
  return out.sort();
}

async function treeContains(dir: string, needle: string): Promise<boolean> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (await treeContains(path, needle)) return true;
    } else if (entry.isFile()) {
      try {
        const content = await fs.readFile(path, 'utf8');
        if (content.includes(needle)) return true;
      } catch {
        // binary/unreadable file — skip
      }
    }
  }
  return false;
}

describe.skipIf(flakey)(
  'build with VERCEL_EXPERIMENTAL_BUILD_CONCURRENCY',
  () => {
    beforeEach(() => {
      delete process.env.__VERCEL_BUILD_RUNNING;
    });

    it('builds a workspace monorepo of services in parallel with output identical to sequential', async () => {
      const parallelOutput = await buildFixture('4');
      expect(client.getFullOutput(), 'concurrent scheduler engaged').toContain(
        'install scopes (concurrency 4)'
      );

      const config = await fs.readJSON(join(parallelOutput, 'config.json'));
      const serviceNames = (config.services ?? [])
        .map((s: { name: string }) => s.name)
        .sort();
      expect(serviceNames).toEqual([...SERVICES].sort());
      for (const name of SERVICES) {
        expect(
          await fs.pathExists(join(parallelOutput, 'services', name)),
          `services/${name} output exists`
        ).toBe(true);
      }

      // The workspace-shared libraries were installed and bundled into the
      // functions — this fails if workspace linking or the install broke.
      expect(
        await treeContains(
          join(parallelOutput, 'services', 'api-a'),
          'via js-shared'
        ),
        'api-a bundles js-shared'
      ).toBe(true);
      const pyFunctionsDir = join(
        parallelOutput,
        'services',
        'py-a',
        'functions'
      );
      const pyFuncBundles = (await fs.readdir(pyFunctionsDir)).filter(name =>
        name.endsWith('.func')
      );
      expect(
        pyFuncBundles,
        'py-a emits exactly one function bundle'
      ).toHaveLength(1);
      const pyVcConfig = await fs.readJSON(
        join(pyFunctionsDir, pyFuncBundles[0], '.vc-config.json')
      );
      const pySharedSource = (
        pyVcConfig.filePathMap as Record<string, string> | undefined
      )?.['_vendor/py_shared/__init__.py'];
      expect(
        pySharedSource,
        'py-a maps py_shared into its bundle'
      ).toBeDefined();
      const fixtureRoot = join(parallelOutput, '..', '..');
      expect(
        await fs.readFile(join(fixtureRoot, pySharedSource!), 'utf8'),
        'mapped py_shared source is the workspace lib'
      ).toContain('via py-shared');

      // Determinism: a sequential build of the same fixture must
      // produce byte-identical top-level and per-service configs.
      const sequentialOutput = await buildFixture('1');
      expect(await listTree(parallelOutput)).toEqual(
        await listTree(sequentialOutput)
      );
      const parallelConfigs = await collectConfigs(parallelOutput);
      const sequentialConfigs = await collectConfigs(sequentialOutput);
      expect(Object.keys(parallelConfigs).sort()).toEqual(
        Object.keys(sequentialConfigs).sort()
      );
      for (const [path, sequentialContent] of Object.entries(
        sequentialConfigs
      )) {
        expect(
          parallelConfigs[path],
          `${path} identical across concurrency`
        ).toBe(sequentialContent);
      }
    });

    it('fails the build (without hanging) when one concurrent service fails', async () => {
      const cwd = setupUnitFixture(
        'commands/build/with-services-parallel-fail'
      );
      delete process.env.__VERCEL_BUILD_RUNNING;
      process.env.VERCEL_EXPERIMENTAL_BUILD_CONCURRENCY = '2';
      try {
        client.cwd = cwd;
        const exitCode = await build(client);
        expect(exitCode, 'build fails').toBe(1);
      } finally {
        delete process.env.VERCEL_EXPERIMENTAL_BUILD_CONCURRENCY;
      }
    });
  }
);
