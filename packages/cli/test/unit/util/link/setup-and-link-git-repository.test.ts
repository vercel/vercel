import { describe, expect, it, beforeEach, vi } from 'vitest';
import { connectGitRepository } from '../../../../src/util/link/setup-and-link';
import { client } from '../../../mocks/client';

// Mock modules
vi.mock('../../../../src/util/create-git-meta', () => ({
  parseGitConfig: vi.fn(),
  pluckRemoteUrls: vi.fn(),
}));

vi.mock('../../../../src/util/git/connect-git-provider', () => ({
  formatProvider: vi.fn(),
  selectAndParseRemoteUrl: vi.fn(),
  checkExistsAndConnect: vi.fn(),
}));

describe('connectGitRepository()', () => {
  let parseGitConfig: any;
  let pluckRemoteUrls: any;
  let formatProvider: any;
  let selectAndParseRemoteUrl: any;
  let checkExistsAndConnect: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Import the mocked modules
    const gitMeta = await import('../../../../src/util/create-git-meta');
    const gitProvider = await import(
      '../../../../src/util/git/connect-git-provider'
    );

    parseGitConfig = gitMeta.parseGitConfig;
    pluckRemoteUrls = gitMeta.pluckRemoteUrls;
    formatProvider = gitProvider.formatProvider;
    selectAndParseRemoteUrl = gitProvider.selectAndParseRemoteUrl;
    checkExistsAndConnect = gitProvider.checkExistsAndConnect;

    // Setup basic mocks
    vi.mocked(formatProvider).mockReturnValue('GitHub');
    vi.mocked(checkExistsAndConnect).mockResolvedValue(undefined);
  });

  it('should connect git when exactly one remote is found', async () => {
    const testPath = '/test-project';

    vi.mocked(parseGitConfig).mockResolvedValue({
      remote: { origin: { url: 'https://github.com/user/repo.git' } },
    });
    vi.mocked(pluckRemoteUrls).mockReturnValue({
      origin: 'https://github.com/user/repo.git',
    });
    vi.mocked(selectAndParseRemoteUrl).mockResolvedValue({
      url: 'https://github.com/user/repo.git',
      provider: 'github',
      org: 'user',
      repo: 'repo',
    });

    const project = { id: 'test-project-id' };
    const org = { id: 'org-id', slug: 'org-slug', type: 'team' as const };

    await connectGitRepository(client, testPath, project, true, org);

    expect(vi.mocked(checkExistsAndConnect)).toHaveBeenCalledWith({
      client,
      confirm: true,
      gitProviderLink: undefined,
      org,
      gitOrg: 'user',
      project,
      provider: 'github',
      repo: 'repo',
      repoPath: 'user/repo',
    });
  });

  it('should handle multiple remotes by prompting user selection', async () => {
    const testPath = '/test-project';
    const project = { id: 'test-project-id' };
    const org = { id: 'org-id', slug: 'org-slug', type: 'team' as const };

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

    // Mock selectAndParseRemoteUrl to return the selected and parsed remote
    vi.mocked(selectAndParseRemoteUrl).mockResolvedValue({
      url: 'https://github.com/user/repo.git',
      provider: 'github',
      org: 'user',
      repo: 'repo',
    });

    await connectGitRepository(client, testPath, project, true, org);

    expect(vi.mocked(checkExistsAndConnect)).toHaveBeenCalledWith({
      client,
      confirm: true,
      gitProviderLink: undefined,
      org,
      gitOrg: 'user',
      project,
      provider: 'github',
      repo: 'repo',
      repoPath: 'user/repo',
    });
  });

  it('should return early when no remotes are found', async () => {
    const testPath = '/test-project';
    const project = { id: 'test-project-id' };
    const org = { id: 'org-id', slug: 'org-slug', type: 'team' as const };

    // Mock git config parsing with no remotes
    vi.mocked(parseGitConfig).mockResolvedValue({
      core: { repositoryformatversion: '0' },
    });
    vi.mocked(pluckRemoteUrls).mockReturnValue({});

    await connectGitRepository(client, testPath, project, true, org);

    // Should NOT attempt to connect git when no remotes exist
    expect(vi.mocked(checkExistsAndConnect)).not.toHaveBeenCalled();
  });

  it('should return early when no git repository exists', async () => {
    const testPath = '/test-project';
    const project = { id: 'test-project-id' };
    const org = { id: 'org-id', slug: 'org-slug', type: 'team' as const };

    // Mock no git config found
    vi.mocked(parseGitConfig).mockResolvedValue(undefined);

    await connectGitRepository(client, testPath, project, true, org);

    // Should NOT attempt to connect git when no git repo exists
    expect(vi.mocked(checkExistsAndConnect)).not.toHaveBeenCalled();
  });

  it('should handle invalid URLs silently', async () => {
    const testPath = '/test-project';
    const project = { id: 'test-project-id' };
    const org = { id: 'org-id', slug: 'org-slug', type: 'team' as const };

    // Mock git config parsing with invalid URL
    vi.mocked(parseGitConfig).mockResolvedValue({
      remote: { origin: { url: 'invalid-url' } },
    });
    vi.mocked(pluckRemoteUrls).mockReturnValue({ origin: 'invalid-url' });
    vi.mocked(selectAndParseRemoteUrl).mockResolvedValue(null); // Invalid URL parsing

    await connectGitRepository(client, testPath, project, true, org);

    // Should NOT attempt to connect git when URL parsing fails
    expect(vi.mocked(checkExistsAndConnect)).not.toHaveBeenCalled();
    // Should not throw or fail
  });

  it('should ask for user confirmation when autoConfirm is false', async () => {
    const testPath = '/test-project';
    const project = { id: 'test-project-id' };
    const org = { id: 'org-id', slug: 'org-slug', type: 'team' as const };

    vi.mocked(parseGitConfig).mockResolvedValue({
      remote: { origin: { url: 'https://github.com/user/repo.git' } },
    });
    vi.mocked(pluckRemoteUrls).mockReturnValue({
      origin: 'https://github.com/user/repo.git',
    });
    vi.mocked(selectAndParseRemoteUrl).mockResolvedValue({
      url: 'https://github.com/user/repo.git',
      provider: 'github',
      org: 'user',
      repo: 'repo',
    });

    // Mock user declining connection
    client.input.confirm = vi.fn().mockResolvedValue(false);

    await connectGitRepository(client, testPath, project, false, org);

    // Should ask for confirmation
    expect(client.input.confirm).toHaveBeenCalledWith(
      'Detected a repository. Connect it to this project?',
      true
    );

    // Should NOT connect when user declines
    expect(vi.mocked(checkExistsAndConnect)).not.toHaveBeenCalled();
  });
});
