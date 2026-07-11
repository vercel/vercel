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
      collectBuilderDevSidecars({ builds: [build], workPath: '/project' })
    ).resolves.toEqual([sidecar]);

    expect(getDevSidecars).toHaveBeenCalledOnce();
    expect(getDevSidecars).toHaveBeenCalledWith({
      workPath: '/project',
      build,
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
        workPath: '/project',
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
      collectBuilderDevSidecars({ builds: [build], workPath: '/project' })
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
