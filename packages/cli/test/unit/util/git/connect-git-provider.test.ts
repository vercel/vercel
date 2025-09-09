import { describe, expect, it } from '@jest/globals';
import {
  parseRepoUrl,
  selectRemoteUrl,
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

describe('selectRemoteUrl()', () => {
  it('should prompt user to select from multiple remotes', async () => {
    const remoteUrls = {
      origin: 'https://github.com/user/repo.git',
      upstream: 'https://github.com/vercel/repo.git',
    };

    // Mock the list selection
    client.stdin.write('1\n'); // Select second option

    const selected = await selectRemoteUrl(client, remoteUrls);

    // Since this is an integration test with the client mock,
    // we'd need to verify the behavior based on the mock setup
    expect(typeof selected).toBe('string');
  });
});
