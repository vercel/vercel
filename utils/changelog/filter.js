function partition(arr, testItem) {
  let trueResults = [];
  let falseResults = [];

  arr.forEach(item => {
    let result = !!testItem(item);
    if (result) {
      trueResults.push(item);
    } else {
      falseResults.push(item);
    }
  });

  return [trueResults, falseResults];
}

/**
 * Filters out "Revert" commits as well as the commits they revert, if found.
 */
function filterReverts(commits) {
  const [revertCommits, filteredLogCommits] = partition(
    commits,
    commit => commit.revertsHashes.length
  );

  let hashesToRemove = [];
  revertCommits.forEach(revertCommit => {
    hashesToRemove = hashesToRemove.concat(revertCommit.revertsHashes);
  });

  return filteredLogCommits.filter(
    commit => !hashesToRemove.includes(commit.hash)
  );
}

function normalizeLog(commits) {
  commits = commits.filter(line => !line.subject.startsWith('Publish '));
  return filterReverts(commits);
}

module.exports = normalizeLog;
