/**
 * Filters out "Revert" commits as well as the commits they revert, if found.
 */
function filterReverts(commits) {
  const revertCommits = commits.filter(commit => commit.revertsHashes.length);
  const commitHashes = commits.map(commit => commit.hash);

  let hashesToRemove = [];
  revertCommits.forEach(revertCommit => {
    const allFound = revertCommit.revertsHashes.every(hash => {
      return commitHashes.includes(hash);
    });

    if (allFound) {
      hashesToRemove = [
        ...hashesToRemove,
        ...revertCommit.revertsHashes,
        revertCommit.hash,
      ];
    }
  });

  return commits.filter(commit => !hashesToRemove.includes(commit.hash));
}

function normalizeLog(commits) {
  commits = commits.filter(line => !line.subject.startsWith('Publish '));
  return filterReverts(commits);
}

module.exports = normalizeLog;
