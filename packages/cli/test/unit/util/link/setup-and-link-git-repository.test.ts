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
  parseRepoUrl: vi.fn(),
  checkExistsAndConnect: vi.fn(),
}));

vi.mock('../../../../src/util/link/repo', () => ({
  findRepoRoot: vi.fn(),
  linkRepoProject: vi.fn(),
}));

describe('connectGitRepository()', () => {
  let parseGitConfig: any;
  let pluckRemoteUrls: any;
  let formatProvider: any;
  let selectAndParseRemoteUrl: any;
  let parseRepoUrl: any;
  let checkExistsAndConnect: any;
  let findRepoRoot: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Import the mocked modules
    const gitMeta = await import('../../../../src/util/create-git-meta');
    const gitProvider = await import(
      '../../../../src/util/git/connect-git-provider'
    );
    const repo = await import('../../../../src/util/link/repo');

    parseGitConfig = gitMeta.parseGitConfig;
    pluckRemoteUrls = gitMeta.pluckRemoteUrls;
    formatProvider = gitProvider.formatProvider;
    selectAndParseRemoteUrl = gitProvider.selectAndParseRemoteUrl;
    parseRepoUrl = gitProvider.parseRepoUrl;
    checkExistsAndConnect = gitProvider.checkExistsAndConnect;
    findRepoRoot = repo.findRepoRoot;

    // Setup basic mocks
    vi.mocked(formatProvider).mockReturnValue('GitHub');
    // By default the linked path *is* the repo root.
    vi.mocked(findRepoRoot).mockResolvedValue('/test-project');
    vi.mocked(checkExistsAndConnect).mockResolvedValue(undefined);
    // `autoConfirm` resolves the remote without prompting, so it goes through
    // `parseRepoUrl` rather than the interactive `selectAndParseRemoteUrl`.
    vi.mocked(parseRepoUrl).mockImplementation((url: string) =>
      url && url.includes('github.com')
        ? {
            url,
            provider: 'github',
            org: url.split('/')[3],
            repo: 'repo',
          }
        : null
    );
    client.nonInteractive = false;
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

    client.input.confirm = vi.fn().mockResolvedValue(true);

    await connectGitRepository(client, testPath, project, false, org);

    // Interactively, the user picks which remote to connect.
    expect(vi.mocked(selectAndParseRemoteUrl)).toHaveBeenCalled();
    expect(vi.mocked(checkExistsAndConnect)).toHaveBeenCalledWith({
      client,
      confirm: false,
      gitProviderLink: undefined,
      org,
      gitOrg: 'user',
      project,
      provider: 'github',
      repo: 'repo',
      repoPath: 'user/repo',
    });
  });

  it('should pick `origin` without prompting when autoConfirm is set', async () => {
    const testPath = '/test-project';
    const project = { id: 'test-project-id' };
    const org = { id: 'org-id', slug: 'org-slug', type: 'team' as const };

    // A fork: `upstream` is listed first to prove `origin` wins on name, not order.
    vi.mocked(parseGitConfig).mockResolvedValue({
      remote: {
        upstream: { url: 'https://github.com/vercel/repo.git' },
        origin: { url: 'https://github.com/user/repo.git' },
      },
    });
    vi.mocked(pluckRemoteUrls).mockReturnValue({
      upstream: 'https://github.com/vercel/repo.git',
      origin: 'https://github.com/user/repo.git',
    });

    client.input.confirm = vi.fn();

    await connectGitRepository(client, testPath, project, true, org);

    // `--yes` must never hang on the remote picker or the confirm.
    expect(vi.mocked(selectAndParseRemoteUrl)).not.toHaveBeenCalled();
    expect(client.input.confirm).not.toHaveBeenCalled();
    expect(vi.mocked(checkExistsAndConnect)).toHaveBeenCalledWith(
      expect.objectContaining({ gitOrg: 'user', repoPath: 'user/repo' })
    );
  });

  it('should fall back to the first remote when there is no `origin`', async () => {
    const testPath = '/test-project';
    const project = { id: 'test-project-id' };
    const org = { id: 'org-id', slug: 'org-slug', type: 'team' as const };

    vi.mocked(parseGitConfig).mockResolvedValue({
      remote: {
        upstream: { url: 'https://github.com/vercel/repo.git' },
        fork: { url: 'https://github.com/other/repo.git' },
      },
    });
    vi.mocked(pluckRemoteUrls).mockReturnValue({
      upstream: 'https://github.com/vercel/repo.git',
      fork: 'https://github.com/other/repo.git',
    });

    await connectGitRepository(client, testPath, project, true, org);

    expect(vi.mocked(selectAndParseRemoteUrl)).not.toHaveBeenCalled();
    expect(vi.mocked(checkExistsAndConnect)).toHaveBeenCalledWith(
      expect.objectContaining({ gitOrg: 'vercel', repoPath: 'vercel/repo' })
    );
  });

  it('should not prompt in non-interactive mode', async () => {
    const testPath = '/test-project';
    const project = { id: 'test-project-id' };
    const org = { id: 'org-id', slug: 'org-slug', type: 'team' as const };

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

    client.nonInteractive = true;
    client.input.confirm = vi.fn();

    // `autoConfirm` is false here: `nonInteractive` alone must suppress prompts.
    await connectGitRepository(client, testPath, project, false, org);

    expect(client.input.confirm).not.toHaveBeenCalled();
    expect(vi.mocked(selectAndParseRemoteUrl)).not.toHaveBeenCalled();
    expect(vi.mocked(checkExistsAndConnect)).toHaveBeenCalledWith(
      expect.objectContaining({ gitOrg: 'user', repoPath: 'user/repo' })
    );
  });

  it('should detect the repo from a subdirectory and derive the root directory', async () => {
    const { resolveGitConnectIntent } = await import(
      '../../../../src/util/link/setup-and-link'
    );

    // Linking from `apps/web` inside a repo rooted at `/repo`.
    vi.mocked(findRepoRoot).mockResolvedValue('/repo');
    vi.mocked(parseGitConfig).mockResolvedValue({
      remote: { origin: { url: 'https://github.com/user/repo.git' } },
    });
    vi.mocked(pluckRemoteUrls).mockReturnValue({
      origin: 'https://github.com/user/repo.git',
    });

    const intent = await resolveGitConnectIntent(
      client,
      '/repo/apps/web',
      true
    );

    // Previously this returned null: there is no `.git` in `apps/web`, so the
    // user was never offered a connection at all.
    expect(intent).not.toBeNull();
    expect(intent?.rootDirectory).toEqual('apps/web');
    expect(vi.mocked(parseGitConfig)).toHaveBeenCalledWith('/repo/.git/config');
  });

  it('should leave the root directory unset when linking from the repo root', async () => {
    const { resolveGitConnectIntent } = await import(
      '../../../../src/util/link/setup-and-link'
    );

    vi.mocked(findRepoRoot).mockResolvedValue('/repo');
    vi.mocked(parseGitConfig).mockResolvedValue({
      remote: { origin: { url: 'https://github.com/user/repo.git' } },
    });
    vi.mocked(pluckRemoteUrls).mockReturnValue({
      origin: 'https://github.com/user/repo.git',
    });

    const intent = await resolveGitConnectIntent(client, '/repo', true);

    expect(intent?.rootDirectory).toBeNull();
  });

  it('should not announce the root directory before the connect prompt', async () => {
    const { resolveGitConnectIntent } = await import(
      '../../../../src/util/link/setup-and-link'
    );
    const output = (await import('../../../../src/output-manager')).default;
    const logSpy = vi.spyOn(output, 'log').mockImplementation(() => {});
    const printSpy = vi.spyOn(output, 'print').mockImplementation(() => {});

    vi.mocked(findRepoRoot).mockResolvedValue('/repo');
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

    client.input.confirm = vi.fn().mockResolvedValue(true);

    await resolveGitConnectIntent(client, '/repo/apps/web', false);

    // Predicting the setting before the answer was wrong on the decline path;
    // it is now reported once from the post-creation summary instead.
    const announced = [...logSpy.mock.calls, ...printSpy.mock.calls].some(
      call => String(call[0]).includes('Root Directory')
    );
    expect(announced).toBe(false);

    logSpy.mockRestore();
    printSpy.mockRestore();
  });

  it('should not apply the root directory when the connection is declined', async () => {
    const { resolveGitConnectIntent } = await import(
      '../../../../src/util/link/setup-and-link'
    );

    vi.mocked(findRepoRoot).mockResolvedValue('/repo');
    vi.mocked(parseGitConfig).mockResolvedValue({
      remote: { origin: { url: 'https://github.com/user/repo.git' } },
    });
    vi.mocked(pluckRemoteUrls).mockReturnValue({
      origin: 'https://github.com/user/repo.git',
    });

    client.input.confirm = vi.fn().mockResolvedValue(false);

    const intent = await resolveGitConnectIntent(
      client,
      '/repo/apps/web',
      false
    );

    // A null intent means the caller neither connects the repo nor sets
    // `settings.rootDirectory`, and the root-directory prompt stays enabled.
    expect(intent).toBeNull();
    expect(vi.mocked(checkExistsAndConnect)).not.toHaveBeenCalled();
  });

  it('should return early when the path is not in a git repository', async () => {
    vi.mocked(findRepoRoot).mockResolvedValue(undefined);

    const project = { id: 'test-project-id' };
    const org = { id: 'org-id', slug: 'org-slug', type: 'team' as const };

    await connectGitRepository(client, '/not-a-repo', project, true, org);

    expect(vi.mocked(checkExistsAndConnect)).not.toHaveBeenCalled();
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
      'Connect detected Git repository?',
      true
    );

    // Should NOT connect when user declines
    expect(vi.mocked(checkExistsAndConnect)).not.toHaveBeenCalled();
  });
});
