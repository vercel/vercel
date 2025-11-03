import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  parseRepoUrl,
  selectAndParseRemoteUrl,
} from '../../../../src/util/git/connect-git-provider';
import { client } from '../../../mocks/client';

describe('parseRepoUrl()', () => {
  it('should parse GitHub HTTPS URL', () => {
    const result = parseRepoUrl('https://github.com/vercel/next.js.git');
    expect(result).toEqual({
      url: 'https://github.com/vercel/next.js.git',
      provider: 'github',
      org: 'vercel',
      repo: 'next.js',
    });
  });

  it('should parse GitHub SSH URL', () => {
    const result = parseRepoUrl('git@github.com:vercel/next.js.git');
    expect(result).toEqual({
      url: 'git@github.com:vercel/next.js.git',
      provider: 'github',
      org: 'vercel',
      repo: 'next.js',
    });
  });

  it('should parse GitLab URL', () => {
    const result = parseRepoUrl('git@gitlab.com:vercel/next.js.git');
    expect(result).toEqual({
      url: 'git@gitlab.com:vercel/next.js.git',
      provider: 'gitlab',
      org: 'vercel',
      repo: 'next.js',
    });
  });

  it('should handle URL without .git suffix', () => {
    const result = parseRepoUrl('https://github.com/vercel/next.js');
    expect(result).toEqual({
      url: 'https://github.com/vercel/next.js',
      provider: 'github',
      org: 'vercel',
      repo: 'next.js',
    });
  });

  it('should handle nested org paths', () => {
    const result = parseRepoUrl('https://github.com/my-org/nested/repo.git');
    expect(result).toEqual({
      url: 'https://github.com/my-org/nested/repo.git',
      provider: 'github',
      org: 'my-org/nested',
      repo: 'repo',
    });
  });

  it('should return null for invalid URLs', () => {
    expect(parseRepoUrl('')).toBeNull();
    expect(parseRepoUrl('not-a-url')).toBeNull();
    expect(parseRepoUrl('https://example.com')).toBeNull();
  });
});

// Mock the selectRemoteUrl function for testing selectAndParseRemoteUrl
vi.mock('../../../../src/util/input/list', () => ({
  default: vi.fn(),
}));

vi.mock('../../../../src/output-manager', () => ({
  default: {
    log: vi.fn(),
    error: vi.fn(),
    initialize: vi.fn(),
  },
}));

describe('selectAndParseRemoteUrl()', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should handle single remote URL automatically', async () => {
    const remoteUrls = { origin: 'https://github.com/user/repo.git' };

    const result = await selectAndParseRemoteUrl(client, remoteUrls);

    expect(result).toEqual({
      url: 'https://github.com/user/repo.git',
      provider: 'github',
      org: 'user',
      repo: 'repo',
    });
  });

  it('should show "Found multiple remote URLs" message for multiple remotes', async () => {
    const { default: list } = await import('../../../../src/util/input/list');
    const output = await import('../../../../src/output-manager');

    const remoteUrls = {
      origin: 'https://github.com/user/repo.git',
      upstream: 'https://github.com/vercel/repo.git',
    };

    vi.mocked(list).mockResolvedValue('https://github.com/user/repo.git');

    const result = await selectAndParseRemoteUrl(client, remoteUrls);

    expect(output.default.log).toHaveBeenCalledWith(
      'Found multiple remote URLs.'
    );
    expect(result).toEqual({
      url: 'https://github.com/user/repo.git',
      provider: 'github',
      org: 'user',
      repo: 'repo',
    });
  });

  it('should return null when user cancels selection', async () => {
    const { default: list } = await import('../../../../src/util/input/list');
    const output = await import('../../../../src/output-manager');

    const remoteUrls = {
      origin: 'https://github.com/user/repo.git',
      upstream: 'https://github.com/vercel/repo.git',
    };

    vi.mocked(list).mockResolvedValue(''); // User canceled

    const result = await selectAndParseRemoteUrl(client, remoteUrls);

    expect(output.default.log).toHaveBeenCalledWith(
      'Found multiple remote URLs.'
    );
    expect(output.default.log).toHaveBeenCalledWith('Canceled');
    expect(result).toBeNull();
  });

  it('should return null for invalid URLs', async () => {
    const remoteUrls = { origin: 'invalid-url' };

    const result = await selectAndParseRemoteUrl(client, remoteUrls);

    expect(result).toBeNull();
  });
});
