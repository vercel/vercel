import { join } from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { liveProjectLinkStore } from '../../src/gateways/project-link-store';
import { readRepoLink } from '../../src/util/link/repo';
import {
  getLinkFromDir,
  getVercelDirectory,
} from '../../src/util/projects/link';

vi.mock('../../src/util/link/repo', () => ({ readRepoLink: vi.fn() }));
vi.mock('../../src/util/projects/link', () => ({
  getLinkFromDir: vi.fn(),
  getVercelDirectory: vi.fn(),
}));

const dir = join('/repo', 'apps', 'web');
const vercelDir = join(dir, '.vercel');
const errno = (code: string) => Object.assign(new Error(code), { code });

describe('liveProjectLinkStore (mocked link helpers)', () => {
  beforeEach(() => {
    vi.mocked(readRepoLink).mockReset();
    vi.mocked(getLinkFromDir).mockReset();
    vi.mocked(getVercelDirectory).mockReset().mockReturnValue(vercelDir);
  });

  describe('readProjectLink', () => {
    it('reads the link from the resolved .vercel directory', async () => {
      const link = { orgId: 'team_1', projectId: 'prj_1' };
      vi.mocked(getLinkFromDir).mockResolvedValue(link);

      await expect(
        liveProjectLinkStore().readProjectLink({ dir })
      ).resolves.toEqual({ type: 'found', value: link });
      expect(getVercelDirectory).toHaveBeenCalledWith(dir);
      expect(getLinkFromDir).toHaveBeenCalledWith(vercelDir);
    });

    it('reports a missing link', async () => {
      vi.mocked(getLinkFromDir).mockResolvedValue(null);

      await expect(
        liveProjectLinkStore().readProjectLink({ dir })
      ).resolves.toEqual({ type: 'missing' });
    });

    it('uses the error code of a directory conflict', async () => {
      const cause = errno('CONFLICTING_CONFIG_DIRECTORIES');
      vi.mocked(getVercelDirectory).mockImplementation(() => {
        throw cause;
      });

      await expect(
        liveProjectLinkStore().readProjectLink({ dir })
      ).resolves.toEqual({
        type: 'error',
        error: {
          code: 'CONFLICTING_CONFIG_DIRECTORIES',
          message: cause.message,
          details: { cause },
        },
      });
    });

    it('maps an uncoded read error to read_failed', async () => {
      const cause = new Error('invalid link');
      vi.mocked(getLinkFromDir).mockRejectedValue(cause);

      await expect(
        liveProjectLinkStore().readProjectLink({ dir })
      ).resolves.toMatchObject({
        type: 'error',
        error: { code: 'read_failed', details: { cause } },
      });
    });
  });

  describe('findRepoLink', () => {
    it('returns only the repo link fields', async () => {
      const repoConfig = { remoteName: 'origin', projects: [] };
      vi.mocked(readRepoLink).mockResolvedValue({
        rootPath: '/repo',
        repoConfigPath: '/repo/.vercel/repo.json',
        repoConfig,
        extra: 'ignored',
      } as Awaited<ReturnType<typeof readRepoLink>>);

      await expect(
        liveProjectLinkStore().findRepoLink({ cwd: dir })
      ).resolves.toEqual({
        type: 'found',
        value: {
          rootPath: '/repo',
          repoConfigPath: '/repo/.vercel/repo.json',
          repoConfig,
        },
      });
      expect(readRepoLink).toHaveBeenCalledWith(dir);
    });

    it('reports a missing repository', async () => {
      vi.mocked(readRepoLink).mockResolvedValue(undefined);

      await expect(
        liveProjectLinkStore().findRepoLink({ cwd: dir })
      ).resolves.toEqual({ type: 'missing' });
    });

    it.each([
      ['a coded error', errno('EACCES'), 'EACCES'],
      ['an uncoded error', new Error('bad repo.json'), 'read_failed'],
    ])('maps %s', async (_name, cause, code) => {
      vi.mocked(readRepoLink).mockRejectedValue(cause);

      await expect(
        liveProjectLinkStore().findRepoLink({ cwd: dir })
      ).resolves.toEqual({
        type: 'error',
        error: { code, message: cause.message, details: { cause } },
      });
    });
  });
});
