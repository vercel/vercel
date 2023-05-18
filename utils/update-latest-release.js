module.exports = async ({ github, context }) => {
  const { owner, repo } = context.repo;
  const response = await github.rest.repos.listReleases({ owner, repo });

  function isVercelCliRelease(release) {
    return release.tag_name.startsWith('vercel@');
  }

  const latestRelease = response.data[0];
  if (isVercelCliRelease(latestRelease)) {
    console.log(`Latest release is "${latestRelease.tag_name}" - skipping`);
    return;
  }

  const latestVercelRelease = response.data.find(isVercelCliRelease);
  console.log(`Promoting "${latestVercelRelease.tag_name}" to latest release`);

  await github.rest.repos.updateRelease({
    owner,
    repo,
    release_id: latestVercelRelease.id,
    make_latest: true,
  });
};
