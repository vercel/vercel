import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { vol, type fs } from 'memfs';
import {
  findProjectRoot,
  resolveProjectCwd,
} from '../../../../src/util/projects/find-project-root';
import {
  isExperimentalServicesEnabled,
  tryDetectServices,
} from '../../../../src/util/projects/detect-services';

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
  isExperimentalServicesEnabled: vi.fn(() => false),
  tryDetectServices: vi.fn(() => null),
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
  const mockedIsEnabled = vi.mocked(isExperimentalServicesEnabled);
  const mockedTryDetect = vi.mocked(tryDetectServices);

  beforeEach(() => {
    vol.reset();
    mockedIsEnabled.mockReturnValue(false);
    mockedTryDetect.mockResolvedValue(null);
  });

  afterEach(() => {
    vol.reset();
  });

  it('should return cwd unchanged when feature flag is off', async () => {
    mockedIsEnabled.mockReturnValue(false);

    const result = await resolveProjectCwd('/project/services/api');

    expect(result).toBe('/project/services/api');
  });

  it('should return project root when flag is on and services detected', async () => {
    mockedIsEnabled.mockReturnValue(true);
    mockedTryDetect.mockResolvedValue({
      services: [{ name: 'api', slug: 'api', directory: 'services/api' }],
    } as any);

    vol.fromJSON({
      '/project/.vercel/project.json': '{}',
      '/project/services/api/package.json': '{}',
    });

    const result = await resolveProjectCwd('/project/services/api');

    expect(result).toBe('/project');
  });

  it('should return original cwd when flag is on but no services found', async () => {
    mockedIsEnabled.mockReturnValue(true);
    mockedTryDetect.mockResolvedValue({
      services: [],
    } as any);

    vol.fromJSON({
      '/project/.vercel/project.json': '{}',
      '/project/services/api/package.json': '{}',
    });

    const result = await resolveProjectCwd('/project/services/api');

    expect(result).toBe('/project/services/api');
  });

  it('should return original cwd when no project root found', async () => {
    mockedIsEnabled.mockReturnValue(true);

    vol.fromJSON({
      '/some/deep/path/package.json': '{}',
    });

    const result = await resolveProjectCwd('/some/deep/path');

    expect(result).toBe('/some/deep/path');
  });
});
