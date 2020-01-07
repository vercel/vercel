// A proxy to get the basic info of an existing github/gitlab repo:
// GET /info?repo=zeit/micro

import parseGitUrl from 'parse-github-url';
import { NextApiRequest, NextApiResponse } from 'next';
import { withApiHandler } from '../../../lib/util/with-api-handler';
import { getGitHubRepoInfo } from '../../../lib/examples/github-repo-info';
import { getGitLabRepoInfo } from '../../../lib/examples/gitlab-repo-info';

export default withApiHandler(async function(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const repoPath = decodeURIComponent(req.query.repo || '');

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
