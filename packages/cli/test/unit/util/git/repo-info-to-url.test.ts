import { repoInfoToUrl } from '../../../../src/util/git/repo-info-to-url';
import type { RepoInfo } from '../../../../src/util/git/connect-git-provider';

describe('repoInfoToUrl()', () => {
  it.skip('should support "github" URL', () => {
    const info: RepoInfo = {
      provider: 'github',
      org: 'vercel',
      repo: 'foo',
      url: 'git@github.com:vercel/foo.git',
    };
    expect(repoInfoToUrl(info)).toEqual('https://github.com/vercel/foo');
  });

  it.skip('should support "gitlab" URL', () => {
    const info: RepoInfo = {
      provider: 'gitlab',
      org: 'vercel',
      repo: 'foo',
      url: 'git@gitlab.com:vercel/foo.git',
    };
    expect(repoInfoToUrl(info)).toEqual('https://gitlab.com/vercel/foo');
  });

  it.skip('should support "bitbucket" URL', () => {
    const info: RepoInfo = {
      provider: 'bitbucket',
      org: 'vercel',
      repo: 'foo',
      url: 'git@bitbucket.com:vercel/foo.git',
    };
    expect(repoInfoToUrl(info)).toEqual('https://bitbucket.com/vercel/foo');
  });
});
