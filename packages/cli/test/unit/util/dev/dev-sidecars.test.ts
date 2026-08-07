import path from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Builder, DevSubscriber } from '@vercel/build-utils';
import type { BuilderWithPkg } from '../../../../src/util/build/import-builders';
import { importBuilders } from '../../../../src/util/build/import-builders';
import {
  collectBuilderDevSidecars,
  toOrchestratorService,
} from '../../../../src/util/dev/dev-sidecars';

vi.mock('../../../../src/util/build/import-builders', () => ({
  importBuilders: vi.fn(),
}));

const build: Builder = {
  use: '@vercel/example-runtime',
  src: '<detect>',
  config: { framework: 'example' },
};

const workPath = path.join(path.sep, 'project');

const sidecar: DevSubscriber = {
  type: 'subscriber',
  name: 'background-subscriber',
  consumer: 'background-consumer',
  workspace: '.',
  runtime: 'example',
  builder: { use: build.use, src: 'worker.ts' },
  topics: ['jobs'],
};

function makeBuilderWithPkg(
  packageName: string,
  getDevSidecars: ReturnType<typeof vi.fn>
): BuilderWithPkg {
  return {
    path: '',
    pkgPath: '',
    dynamicallyInstalled: false,
    pkg: { name: packageName },
    builder: {
      version: -1,
      build: vi.fn(),
      getDevSidecars,
    },
  } as unknown as BuilderWithPkg;
}

describe('builder development sidecars', () => {
  beforeEach(() => {
    vi.mocked(importBuilders).mockReset();
  });

  it('collects sidecars from the original build configuration', async () => {
    const getDevSidecars = vi.fn().mockResolvedValue([sidecar]);
    vi.mocked(importBuilders).mockResolvedValue(
      new Map([[build.use, makeBuilderWithPkg(build.use, getDevSidecars)]])
    );

    await expect(
      collectBuilderDevSidecars({ builds: [build], workPath })
    ).resolves.toEqual([sidecar]);

    expect(getDevSidecars).toHaveBeenCalledOnce();
    expect(getDevSidecars).toHaveBeenCalledWith({
      workPath,
      build,
    });
  });

  it('collects and namespaces sidecars from declared Python services', async () => {
    const getDevSidecars = vi.fn().mockResolvedValue([sidecar]);
    vi.mocked(importBuilders).mockResolvedValue(
      new Map([
        [
          '@vercel/python',
          makeBuilderWithPkg('@vercel/python', getDevSidecars),
        ],
      ])
    );

    const service = {
      schema: 'experimentalServicesV2' as const,
      name: 'backend',
      root: 'apps/backend',
      framework: 'fastapi',
      runtime: 'python',
      entrypoint: 'pyproject.toml',
      builder: {
        use: '@vercel/python',
        src: 'apps/backend/pyproject.toml',
        config: { workspace: 'apps/backend' },
      },
    };

    await expect(
      collectBuilderDevSidecars({
        builds: [service.builder],
        workPath,
        services: [service],
      })
    ).resolves.toEqual([
      {
        ...sidecar,
        name: 'backend-background-subscriber',
        workspace: 'apps/backend',
      },
    ]);

    expect(getDevSidecars).toHaveBeenCalledWith({
      workPath: path.join(workPath, 'apps/backend'),
      build: service.builder,
      service,
    });
  });

  it('lets builders decide whether ordinary services contribute sidecars', async () => {
    const getDevSidecars = vi.fn().mockResolvedValue([]);
    vi.mocked(importBuilders).mockResolvedValue(
      new Map([
        [
          '@vercel/python',
          makeBuilderWithPkg('@vercel/python', getDevSidecars),
        ],
      ])
    );
    const service = {
      schema: 'experimentalServicesV2' as const,
      name: 'backend',
      root: 'backend',
      runtime: 'python',
      entrypoint: 'app.py',
      builder: { use: '@vercel/python', src: 'backend/app.py' },
    };

    await expect(
      collectBuilderDevSidecars({
        builds: [service.builder],
        workPath,
        services: [service],
      })
    ).resolves.toEqual([]);

    expect(getDevSidecars).toHaveBeenCalledWith({
      workPath: path.join(workPath, 'backend'),
      build: service.builder,
      service,
    });
  });

  it('rejects duplicate sidecar names from build configurations', async () => {
    const getDevSidecars = vi.fn().mockResolvedValue([sidecar]);
    vi.mocked(importBuilders).mockResolvedValue(
      new Map([[build.use, makeBuilderWithPkg(build.use, getDevSidecars)]])
    );

    await expect(
      collectBuilderDevSidecars({
        builds: [build, build],
        workPath,
      })
    ).rejects.toThrow(
      'Multiple builders contributed a development sidecar named "background-subscriber"'
    );
  });

  it('rejects unsupported sidecar types', async () => {
    const getDevSidecars = vi
      .fn()
      .mockResolvedValue([{ ...sidecar, type: 'web' }]);
    vi.mocked(importBuilders).mockResolvedValue(
      new Map([[build.use, makeBuilderWithPkg(build.use, getDevSidecars)]])
    );

    await expect(
      collectBuilderDevSidecars({ builds: [build], workPath })
    ).rejects.toThrow(
      'Development sidecar "background-subscriber" has unsupported type "web"'
    );
  });

  it('adapts subscribers without conflating their process and consumer names', () => {
    expect(toOrchestratorService(sidecar)).toMatchObject({
      schema: 'experimentalServices',
      name: 'background-subscriber',
      consumer: 'background-consumer',
      type: 'worker',
      trigger: 'queue',
      topics: ['jobs'],
    });
  });
});
