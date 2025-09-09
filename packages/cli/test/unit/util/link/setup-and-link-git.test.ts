import { describe, expect, it, beforeEach } from '@jest/globals';
import setupAndLink from '../../../../src/util/link/setup-and-link';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeams } from '../../../mocks/team';

// Mock modules
jest.mock('../../../../src/util/create-git-meta', () => ({
  parseGitConfig: jest.fn(),
  pluckRemoteUrls: jest.fn(),
}));

jest.mock('../../../../src/util/git/connect-git-provider', () => ({
  parseRepoUrl: jest.fn(),
  connectGitProvider: jest.fn(),
  formatProvider: jest.fn(),
}));

const {
  parseGitConfig,
  pluckRemoteUrls,
} = require('../../../../src/util/create-git-meta');
const {
  parseRepoUrl,
  connectGitProvider,
  formatProvider,
} = require('../../../../src/util/git/connect-git-provider');

describe('setup-and-link git integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useUser();
    useTeams('team_dummy');

    // Setup basic mocks
    (formatProvider as jest.Mock).mockReturnValue('GitHub');
    (connectGitProvider as jest.Mock).mockResolvedValue(undefined);
  });

  it('should connect git when exactly one remote is found', async () => {
    // Mock git config parsing
    (parseGitConfig as jest.Mock).mockResolvedValue({
      remote: { origin: { url: 'https://github.com/user/repo.git' } },
    });
    (pluckRemoteUrls as jest.Mock).mockReturnValue({
      origin: 'https://github.com/user/repo.git',
    });
    (parseRepoUrl as jest.Mock).mockReturnValue({
      url: 'https://github.com/user/repo.git',
      provider: 'github',
      org: 'user',
      repo: 'repo',
    });

    // Mock user input - auto confirm setup and git connection
    client.stdin.write('y\n'); // Confirm setup
    client.stdin.write('\r'); // Select org
    client.stdin.write('test-project\n'); // Project name
    client.stdin.write('y\n'); // Confirm git connection

    const result = await setupAndLink(client, testPath, { autoConfirm: true });

    expect(result.status).toBe('linked');
    expect(connectGitProvider).toHaveBeenCalledWith(
      client,
      expect.any(String), // project ID
      'github',
      'user/repo'
    );
  });

  it('should skip git connection when multiple remotes are found', async () => {
    // Mock git config parsing with multiple remotes
    (parseGitConfig as jest.Mock).mockResolvedValue({
      remote: {
        origin: { url: 'https://github.com/user/repo.git' },
        upstream: { url: 'https://github.com/vercel/repo.git' },
      },
    });
    (pluckRemoteUrls as jest.Mock).mockReturnValue({
      origin: 'https://github.com/user/repo.git',
      upstream: 'https://github.com/vercel/repo.git',
    });

    client.stdin.write('y\n'); // Confirm setup
    client.stdin.write('\r'); // Select org
    client.stdin.write('test-project\n'); // Project name

    const result = await setupAndLink(client, testPath, { autoConfirm: true });

    expect(result.status).toBe('linked');
    // Should NOT attempt to connect git when multiple remotes exist
    expect(connectGitProvider).not.toHaveBeenCalled();
  });

  it('should skip git connection when no remotes are found', async () => {
    // Mock git config parsing with no remotes
    (parseGitConfig as jest.Mock).mockResolvedValue({
      core: { repositoryformatversion: '0' },
    });
    (pluckRemoteUrls as jest.Mock).mockReturnValue({});

    client.stdin.write('y\n'); // Confirm setup
    client.stdin.write('\r'); // Select org
    client.stdin.write('test-project\n'); // Project name

    const result = await setupAndLink(client, testPath, { autoConfirm: true });

    expect(result.status).toBe('linked');
    // Should NOT attempt to connect git when no remotes exist
    expect(vi.mocked(connectGitProvider)).not.toHaveBeenCalled();
  });

  it('should skip git connection when no git repository exists', async () => {
    // Mock no git config found
    vi.mocked(parseGitConfig).mockResolvedValue(null);

    client.stdin.write('y\n'); // Confirm setup
    client.stdin.write('\r'); // Select org
    client.stdin.write('test-project\n'); // Project name

    const result = await setupAndLink(client, testPath, { autoConfirm: true });

    expect(result.status).toBe('linked');
    // Should NOT attempt to connect git when no git repo exists
    expect(vi.mocked(connectGitProvider)).not.toHaveBeenCalled();
  });

  it('should handle git connection errors silently', async () => {
    // Mock git config parsing with invalid URL
    (parseGitConfig as jest.Mock).mockResolvedValue({
      remote: { origin: { url: 'invalid-url' } },
    });
    (pluckRemoteUrls as jest.Mock).mockReturnValue({ origin: 'invalid-url' });
    (parseRepoUrl as jest.Mock).mockReturnValue(null); // Invalid URL parsing

    client.stdin.write('y\n'); // Confirm setup
    client.stdin.write('\r'); // Select org
    client.stdin.write('test-project\n'); // Project name

    const result = await setupAndLink(client, testPath, { autoConfirm: true });

    expect(result.status).toBe('linked');
    // Should NOT attempt to connect git when URL parsing fails
    expect(vi.mocked(connectGitProvider)).not.toHaveBeenCalled();
    // Should not throw or fail the setup process
  });
});
