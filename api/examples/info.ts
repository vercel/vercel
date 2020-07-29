// A proxy to get the basic info of an existing github/gitlab repo:
// GET /info?repo=vercel/micro

// @ts-ignore
import parseGitUrl from 'parse-github-url';
import { NowRequest, NowResponse } from '@vercel/node';
import { withApiHandler } from '../_lib/util/with-api-handler';
import { getGitHubRepoInfo } from '../_lib/examples/github-repo-info';
import { getGitLabRepoInfo } from '../_lib/examples/gitlab-repo-info';

export default withApiHandler(async function (
  req: NowRequest,
  res: NowResponse
) {
  const repoPath = decodeURIComponent((req.query.repo as string) || '');

  if (!repoPath) {
    return res.status(404).json({
      error: {
        code: 'not_found',
        message: 'Please provide the `repo` parameter.',
      },
    });
  }

  const repo = parseGitUrl(repoPath);

  if (!repo.repo) {
    return res.status(400).json({
      error: {
        code: 'invalid_repo_url',
        message: 'Repository URL is invalid.',
      },
    });
  }

  if (repo.host === 'github.com') {
    // URL is 'https://github.com/user/repo' or 'user/repo'
    return res.json((await getGitHubRepoInfo(repo)) || {});
  }

  // gitlab
  res.json((await getGitLabRepoInfo(repo)) || {});
});
