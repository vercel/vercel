interface Repo {
  repo: string;
  owner: {
    username: string;
  };
  username: string;
  branch: string;
}

/**
 * Fetch the meta info of a public gitlab repo
 * @param {object} repo parsed by the `parse-github-url` package
 */
export async function getGitLabRepoInfo(repo: Repo) {
  const response = await fetch(
    `https://gitlab.com/api/v4/projects/${encodeURIComponent(repo.repo)}`
  );

  if (response.status !== 200) {
    console.log(`Non-200 response code from GitLab: ${response.status}`);
    return null;
  }

  const parsed = await response.json();
  if (parsed.path_with_namespace !== repo.repo) {
    console.log(`Invalid response from GitLab`);
    return null;
  }

  return {
    id: parsed.path_with_namespace,
    name: parsed.path,
    url: parsed.web_url,
    owner: parsed.owner ? parsed.owner.username : repo.owner,
    description: parsed.description,
    homepage: null,
    size: 0,
    createdAt: parsed.created_at,
    updatedAt: parsed.last_activity_at,
    stars: parsed.star_count,
    branch: repo.branch,
  };
}
