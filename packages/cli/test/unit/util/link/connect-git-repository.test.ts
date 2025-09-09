import { describe, expect, it, beforeEach, vi } from 'vitest';
import { connectGitRepository } from '../../../../src/util/link/setup-and-link';
import { client } from '../../../mocks/client';

// Mock modules
vi.mock('../../../../src/util/create-git-meta', () => ({
  parseGitConfig: vi.fn(),
  pluckRemoteUrls: vi.fn(),
}));

vi.mock('../../../../src/util/git/connect-git-provider', () => ({
  parseRepoUrl: vi.fn(),
  connectGitProvider: vi.fn(),
  formatProvider: vi.fn(),
  selectRemoteUrl: vi.fn(),
}));

const { parseGitConfig, pluckRemoteUrls } = await import(
  '../../../../src/util/create-git-meta'
);
const { parseRepoUrl, connectGitProvider, formatProvider, selectRemoteUrl } =
  await import('../../../../src/util/git/connect-git-provider');

describe('connectGitRepository()', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup basic mocks
    vi.mocked(formatProvider).mockReturnValue('GitHub');
    vi.mocked(connectGitProvider).mockResolvedValue(undefined);
  });

  it('should connect git when exactly one remote is found', async () => {
    const testPath = '/test-project';

    vi.mocked(parseGitConfig).mockResolvedValue({
      remote: { origin: { url: 'https://github.com/user/repo.git' } },
    });
    vi.mocked(pluckRemoteUrls).mockReturnValue({
      origin: 'https://github.com/user/repo.git',
    });
    vi.mocked(parseRepoUrl).mockReturnValue({
      url: 'https://github.com/user/repo.git',
      provider: 'github',
      org: 'user',
      repo: 'repo',
    });

    const project = { id: 'test-project-id' };

    await connectGitRepository(client, testPath, project, true);

    expect(vi.mocked(connectGitProvider)).toHaveBeenCalledWith(
      client,
      'test-project-id',
      'github',
      'user/repo'
    );
  });

  it('should handle multiple remotes by prompting user selection', async () => {
    const testPath = '/test-project';
    const project = { id: 'test-project-id' };

    // Mock git config parsing with multiple remotes
    vi.mocked(parseGitConfig).mockResolvedValue({
      remote: {
        origin: { url: 'https://github.com/user/repo.git' },
        upstream: { url: 'https://github.com/vercel/repo.git' },
      },
    });
    vi.mocked(pluckRemoteUrls).mockReturnValue({
      origin: 'https://github.com/user/repo.git',
      upstream: 'https://github.com/vercel/repo.git',
    });
    vi.mocked(parseRepoUrl).mockReturnValue({
      url: 'https://github.com/user/repo.git',
      provider: 'github',
      org: 'user',
      repo: 'repo',
    });

    // Mock selectRemoteUrl to return the first remote
    vi.mocked(selectRemoteUrl).mockResolvedValue(
      'https://github.com/user/repo.git'
    );

    await connectGitRepository(client, testPath, project, true);

    expect(vi.mocked(connectGitProvider)).toHaveBeenCalledWith(
      client,
      'test-project-id',
      'github',
      'user/repo'
    );
  });

  it('should return early when no remotes are found', async () => {
    const testPath = '/test-project';
    const project = { id: 'test-project-id' };

    // Mock git config parsing with no remotes
    vi.mocked(parseGitConfig).mockResolvedValue({
      core: { repositoryformatversion: '0' },
    });
    vi.mocked(pluckRemoteUrls).mockReturnValue({});

    await connectGitRepository(client, testPath, project, true);

    // Should NOT attempt to connect git when no remotes exist
    expect(vi.mocked(connectGitProvider)).not.toHaveBeenCalled();
  });

  it('should return early when no git repository exists', async () => {
    const testPath = '/test-project';
    const project = { id: 'test-project-id' };

    // Mock no git config found
    vi.mocked(parseGitConfig).mockResolvedValue(null);

    await connectGitRepository(client, testPath, project, true);

    // Should NOT attempt to connect git when no git repo exists
    expect(vi.mocked(connectGitProvider)).not.toHaveBeenCalled();
  });

  it('should handle invalid URLs silently', async () => {
    const testPath = '/test-project';
    const project = { id: 'test-project-id' };

    // Mock git config parsing with invalid URL
    vi.mocked(parseGitConfig).mockResolvedValue({
      remote: { origin: { url: 'invalid-url' } },
    });
    vi.mocked(pluckRemoteUrls).mockReturnValue({ origin: 'invalid-url' });
    vi.mocked(parseRepoUrl).mockReturnValue(null); // Invalid URL parsing

    await connectGitRepository(client, testPath, project, true);

    // Should NOT attempt to connect git when URL parsing fails
    expect(vi.mocked(connectGitProvider)).not.toHaveBeenCalled();
    // Should not throw or fail
  });
});
