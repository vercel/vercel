import { beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('@vercel/fs-detectors', async () => {
  const actual = await vi.importActual<typeof import('@vercel/fs-detectors')>(
    '@vercel/fs-detectors'
  );
  return {
    ...actual,
    getWorkspaces: vi.fn(),
  };
});

vi.mock('../../../../src/util/projects/detect-projects', () => ({
  detectProjects: vi.fn(),
}));

const { getWorkspaces } = await import('@vercel/fs-detectors');
const { detectProjects } = await import(
  '../../../../src/util/projects/detect-projects'
);
const mockedGetWorkspaces = vi.mocked(getWorkspaces);
const mockedDetectProjects = vi.mocked(detectProjects);

import { shouldPromptForRootDirectory } from '../../../../src/util/link/setup-and-link';

describe('shouldPromptForRootDirectory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('returns true when the user explicitly picked "project-directory" via the services picker', async () => {
    const result = await shouldPromptForRootDirectory({
      path: '/tmp/repo',
      servicesChoice: { type: 'project-directory' },
    });
    expect(result).toBe(true);
    // Short-circuit — no fs work needed.
    expect(mockedGetWorkspaces).not.toHaveBeenCalled();
    expect(mockedDetectProjects).not.toHaveBeenCalled();
  });

  test('returns true when the cwd is a workspace (monorepo with multiple packages)', async () => {
    mockedGetWorkspaces.mockResolvedValueOnce([
      { rootPath: '/tmp/repo/pkg-a', type: 'npm' },
    ] as unknown as Awaited<ReturnType<typeof getWorkspaces>>);
    const result = await shouldPromptForRootDirectory({
      path: '/tmp/repo',
      servicesChoice: null,
    });
    expect(result).toBe(true);
  });

  test('returns false for a single-app project with a framework detected at the root', async () => {
    mockedGetWorkspaces.mockResolvedValueOnce([]);
    mockedDetectProjects.mockResolvedValueOnce(
      new Map([['', [{ slug: 'nextjs', name: 'Next.js' } as never]]])
    );
    const result = await shouldPromptForRootDirectory({
      path: '/tmp/single-app',
      servicesChoice: null,
    });
    expect(result).toBe(false);
  });

  test('returns true for a nested monolith — framework NOT detected at root (e.g. repo/app/package.json)', async () => {
    mockedGetWorkspaces.mockResolvedValueOnce([]);
    // detectProjects returns an empty Map (or a Map without an entry for the root)
    mockedDetectProjects.mockResolvedValueOnce(new Map());
    const result = await shouldPromptForRootDirectory({
      path: '/tmp/nested-repo',
      servicesChoice: null,
    });
    expect(result).toBe(true);
  });

  test('returns true when root has an empty framework array', async () => {
    mockedGetWorkspaces.mockResolvedValueOnce([]);
    mockedDetectProjects.mockResolvedValueOnce(new Map([['', []]]));
    const result = await shouldPromptForRootDirectory({
      path: '/tmp/empty-repo',
      servicesChoice: null,
    });
    expect(result).toBe(true);
  });

  test('returns true when detectProjects throws (degrade gracefully — safer to prompt than silently misconfigure)', async () => {
    mockedGetWorkspaces.mockResolvedValueOnce([]);
    mockedDetectProjects.mockRejectedValueOnce(new Error('detection failed'));
    const result = await shouldPromptForRootDirectory({
      path: '/tmp/broken-repo',
      servicesChoice: null,
    });
    expect(result).toBe(true);
  });
});
