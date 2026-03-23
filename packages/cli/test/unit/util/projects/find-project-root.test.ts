import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { vol, type fs } from 'memfs';
import {
  findProjectRoot,
  resolveProjectCwd,
} from '../../../../src/util/projects/find-project-root';
import { tryDetectServices } from '../../../../src/util/projects/detect-services';

vi.mock('fs/promises', async () => {
  const memfs: { fs: typeof fs } = await vi.importActual('memfs');
  return memfs.fs.promises;
});

vi.mock('fs-extra', async () => {
  const memfs: { fs: typeof fs } = await vi.importActual('memfs');
  return {
    pathExists: async (path: string) => {
      try {
        memfs.fs.statSync(path);
        return true;
      } catch {
        return false;
      }
    },
  };
});

vi.mock('../../../../src/util/projects/detect-services', () => ({
  tryDetectServices: vi.fn(async () => null),
}));

describe('findProjectRoot', () => {
  beforeEach(() => {
    vol.reset();
  });

  afterEach(() => {
    vol.reset();
  });

  it('should find project root with .vercel directory', async () => {
    vol.fromJSON({
      '/project/.vercel/project.json': '{}',
      '/project/services/api/package.json': '{}',
    });

    const result = await findProjectRoot('/project/services/api');

    expect(result).toBe('/project');
  });

  it('should find project root with vercel.json', async () => {
    vol.fromJSON({
      '/project/vercel.json': '{}',
      '/project/services/api/package.json': '{}',
    });

    const result = await findProjectRoot('/project/services/api');

    expect(result).toBe('/project');
  });

  it('should return .git-only root', async () => {
    vol.fromJSON({
      '/monorepo/.git/config': '',
      '/monorepo/apps/my-app/package.json': '{}',
    });

    const result = await findProjectRoot('/monorepo/apps/my-app');

    expect(result).toBe('/monorepo');
  });

  it('should skip the starting directory', async () => {
    // Even if startDir has .vercel, we should look for a parent
    vol.fromJSON({
      '/project/.vercel/project.json': '{}',
      '/project/services/api/.vercel/project.json': '{}',
      '/project/services/api/package.json': '{}',
    });

    const result = await findProjectRoot('/project/services/api');

    expect(result).toBe('/project');
  });

  it('should return null when no project root is found', async () => {
    vol.fromJSON({
      '/some/deep/path/package.json': '{}',
    });

    const result = await findProjectRoot('/some/deep/path');

    expect(result).toBe(null);
  });
});

describe('resolveProjectCwd', () => {
  const mockedTryDetect = vi.mocked(tryDetectServices);

  beforeEach(() => {
    vol.reset();
    mockedTryDetect.mockResolvedValue(null);
  });

  afterEach(() => {
    vol.reset();
  });

  it('should return cwd unchanged when no services are detected', async () => {
    const result = await resolveProjectCwd('/project/services/api');

    expect(result).toBe('/project/services/api');
  });

  it('should return project root when services are detected', async () => {
    mockedTryDetect.mockResolvedValue({
      resolved: {
        source: 'configured',
        services: [{ name: 'api', slug: 'api', directory: 'services/api' }],
        routes: {
          hostRewrites: [],
          rewrites: [],
          defaults: [],
          crons: [],
          workers: [],
        },
        errors: [],
        warnings: [],
      },
      inferred: null,
    } as any);

    vol.fromJSON({
      '/project/.vercel/project.json': '{}',
      '/project/services/api/package.json': '{}',
    });

    const result = await resolveProjectCwd('/project/services/api');

    expect(result).toBe('/project');
  });

  it('should return original cwd when no services are found', async () => {
    mockedTryDetect.mockResolvedValue(null);

    vol.fromJSON({
      '/project/.vercel/project.json': '{}',
      '/project/services/api/package.json': '{}',
    });

    const result = await resolveProjectCwd('/project/services/api');

    expect(result).toBe('/project/services/api');
  });

  it('should return original cwd when no project root found', async () => {
    vol.fromJSON({
      '/some/deep/path/package.json': '{}',
    });

    const result = await resolveProjectCwd('/some/deep/path');

    expect(result).toBe('/some/deep/path');
  });
});
