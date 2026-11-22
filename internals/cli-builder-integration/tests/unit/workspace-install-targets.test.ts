import { mkdtemp, mkdir, rm, writeFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { afterEach, describe, expect, test } from 'vitest';
import type {
  Builder,
  Service,
  WorkspaceInstallTarget,
} from '@vercel/build-utils';
import { detectBuildersWithServices } from '../../src/detect-builders-with-services';
import { collectWorkspaceInstallTargets } from '../../src/workspace-install-targets';

const roots: string[] = [];

async function createWorkspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'workspace-targets-'));
  roots.push(root);
  await Promise.all([
    writeFile(
      join(root, 'package.json'),
      JSON.stringify({ name: 'fixture-root', workspaces: ['services/*'] })
    ),
    writeFile(
      join(root, 'package-lock.json'),
      JSON.stringify({ lockfileVersion: 3 })
    ),
    ...['alpha', 'beta', 'custom', 'disabled', 'go'].map(async name => {
      const serviceRoot = join(root, 'services', name);
      await mkdir(join(serviceRoot, 'api'), { recursive: true });
      await Promise.all([
        writeFile(
          join(serviceRoot, 'package.json'),
          JSON.stringify({ name: `@fixture/${name}` })
        ),
        writeFile(join(serviceRoot, 'api/index.js'), 'module.exports = {}'),
      ]);
    }),
  ]);
  return root;
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map(root => rm(root, { recursive: true, force: true }))
  );
});

describe('collectWorkspaceInstallTargets', () => {
  test('resolves both Node Services V2 workspaces and the root package', async () => {
    const workPath = await createWorkspace();
    const { builders, errors, services } = await detectBuildersWithServices(
      [],
      undefined,
      {
        services: {
          alpha: {
            root: 'services/alpha',
            runtime: 'node',
            entrypoint: 'api/index.js',
          },
          beta: {
            root: 'services/beta',
            runtime: 'node',
            entrypoint: 'api/index.js',
          },
        },
        projectSettings: { framework: null },
        workPath,
      }
    );
    expect(errors).toBeNull();
    expect(builders).toHaveLength(2);
    expect(services).toHaveLength(2);
    const nodeBuilders = builders!;
    const serviceByBuilder = new Map(
      services!.map(service => [service.builder, service])
    );

    expect(
      await collectWorkspaceInstallTargets({
        builds: nodeBuilders,
        repoRootPath: workPath,
        serviceByBuilder,
        workPath,
      })
    ).toEqual([
      {
        installRoot: workPath,
        isRoot: true,
        name: 'fixture-root',
        packageJsonPath: join(workPath, 'package.json'),
        relativePath: '.',
      },
      {
        installRoot: workPath,
        name: '@fixture/alpha',
        packageJsonPath: join(workPath, 'services/alpha/package.json'),
        relativePath: 'services/alpha',
      },
      {
        installRoot: workPath,
        name: '@fixture/beta',
        packageJsonPath: join(workPath, 'services/beta/package.json'),
        relativePath: 'services/beta',
      },
    ]);
  });

  test('keeps custom and disabled install services in the focus set alongside scoped services', async () => {
    const workPath = await createWorkspace();
    const alphaBuilder: Builder = {
      src: 'services/alpha/api/index.ts',
      use: '@vercel/backends',
    };
    const customBuilder: Builder = {
      src: 'services/custom/api/index.ts',
      use: '@vercel/backends',
    };
    const disabledBuilder: Builder = {
      src: 'services/disabled/api/index.ts',
      use: '@vercel/backends',
    };
    const serviceByBuilder = new Map<Builder, Service>([
      [
        alphaBuilder,
        {
          name: 'alpha',
          root: 'services/alpha',
          runtime: 'node',
          schema: 'experimentalServicesV2',
          builder: alphaBuilder,
        } as Service,
      ],
      [
        customBuilder,
        {
          name: 'custom',
          root: 'services/custom',
          runtime: 'node',
          installCommand: './install.sh',
          schema: 'experimentalServicesV2',
          builder: customBuilder,
        } as Service,
      ],
      [
        disabledBuilder,
        {
          name: 'disabled',
          root: 'services/disabled',
          runtime: 'node',
          installCommand: '',
          schema: 'experimentalServicesV2',
          builder: disabledBuilder,
        } as Service,
      ],
    ]);

    const existingTarget: WorkspaceInstallTarget = {
      installRoot: workPath,
      name: '@fixture/beta',
      packageJsonPath: join(workPath, 'services/beta/package.json'),
      relativePath: 'services/beta',
    };

    const targets = await collectWorkspaceInstallTargets({
      builds: [alphaBuilder, customBuilder, disabledBuilder],
      existingTargets: [existingTarget],
      repoRootPath: workPath,
      serviceByBuilder,
      workPath,
    });

    expect(targets.map(target => target.relativePath).sort()).toEqual([
      '.',
      'services/alpha',
      'services/beta',
      'services/custom',
      'services/disabled',
    ]);
  });

  test('resolves a nested Yarn project without including unrelated workspaces', async () => {
    const repoRootPath = await mkdtemp(join(tmpdir(), 'workspace-targets-'));
    roots.push(repoRootPath);
    const workPath = join(repoRootPath, 'apps/project');
    const unrelatedPath = join(repoRootPath, 'packages/unrelated');
    await Promise.all([
      mkdir(join(workPath, 'api'), { recursive: true }),
      mkdir(unrelatedPath, { recursive: true }),
    ]);
    await Promise.all([
      writeFile(
        join(repoRootPath, 'package.json'),
        JSON.stringify({
          name: 'workspace-focus-repro-root',
          packageManager: 'yarn@4.9.2',
          workspaces: ['apps/*', 'packages/*'],
        })
      ),
      writeFile(join(repoRootPath, 'yarn.lock'), '__metadata:\n  version: 8\n'),
      writeFile(
        join(workPath, 'package.json'),
        JSON.stringify({ name: '@repro/project' })
      ),
      writeFile(
        join(workPath, 'vercel.json'),
        JSON.stringify({ installCommand: 'yarn install:focused' })
      ),
      writeFile(join(workPath, 'api/index.js'), 'module.exports = {}'),
      writeFile(
        join(unrelatedPath, 'package.json'),
        JSON.stringify({ name: '@repro/unrelated' })
      ),
    ]);
    const builder: Builder = {
      src: 'api/index.js',
      use: '@vercel/node',
    };

    const targets = await collectWorkspaceInstallTargets({
      builds: [builder],
      repoRootPath,
      serviceByBuilder: new Map(),
      workPath,
    });

    expect(targets).toEqual([
      {
        installRoot: repoRootPath,
        isRoot: true,
        name: 'workspace-focus-repro-root',
        packageJsonPath: join(repoRootPath, 'package.json'),
        relativePath: '.',
      },
      {
        installRoot: repoRootPath,
        name: '@repro/project',
        packageJsonPath: join(workPath, 'package.json'),
        relativePath: 'apps/project',
      },
    ]);
  });

  test('removes stale targets when a later target is not in the workspace', async () => {
    const workPath = await createWorkspace();
    const outsideRoot = join(workPath, 'outside');
    await mkdir(join(outsideRoot, 'api'), { recursive: true });
    await writeFile(
      join(outsideRoot, 'package.json'),
      JSON.stringify({ name: '@fixture/outside' })
    );
    const outsideBuilder: Builder = {
      src: 'outside/api/index.ts',
      use: '@vercel/node',
    };
    const existingTarget: WorkspaceInstallTarget = {
      installRoot: workPath,
      name: '@fixture/alpha',
      packageJsonPath: join(workPath, 'services/alpha/package.json'),
      relativePath: 'services/alpha',
    };

    expect(
      await collectWorkspaceInstallTargets({
        builds: [outsideBuilder],
        existingTargets: [existingTarget],
        repoRootPath: workPath,
        serviceByBuilder: new Map(),
        workPath,
      })
    ).toEqual([]);
  });

  test('ignores non-Node services and preserves existing targets', async () => {
    const workPath = await createWorkspace();
    const goBuilder: Builder = {
      src: 'services/go/api/index.go',
      use: '@vercel/go',
    };
    const serviceByBuilder = new Map<Builder, Service>([
      [
        goBuilder,
        {
          name: 'go',
          root: 'services/go',
          runtime: 'go',
          schema: 'experimentalServicesV2',
          builder: goBuilder,
        } as Service,
      ],
    ]);
    const existingTarget: WorkspaceInstallTarget = {
      installRoot: workPath,
      name: '@fixture/alpha',
      packageJsonPath: join(workPath, 'services/alpha/package.json'),
      relativePath: 'services/alpha',
    };

    expect(
      await collectWorkspaceInstallTargets({
        builds: [goBuilder],
        existingTargets: [existingTarget],
        repoRootPath: workPath,
        serviceByBuilder,
        workPath,
      })
    ).toEqual([existingTarget]);
  });
});
