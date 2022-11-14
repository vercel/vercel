const { execSync } = require('child_process');

const REVERT_MESSAGE_COMMIT_PATTERN = /This reverts commit ([^.^ ]+)/;
const AREA_PATTERN = /\[([^\]]+)\]/g;

function getCommitMessage(hash) {
  return execSync(`git log --format=%B -n 1 ${hash}`).toString().trim();
}

function parseRevertCommit(message) {
  // EX: This reverts commit 6dff0875f5f361decdb95ad70a400195006c6bba.
  // EX: This reverts commit 6dff0875f5f361decdb95ad70a400195006c6bba (#123123).
  const fullMessageLines = message
    .trim()
    .split('\n')
    .filter(line => line.startsWith('This reverts commit'));
  return fullMessageLines.map(
    line => line.match(REVERT_MESSAGE_COMMIT_PATTERN)[1]
  );
}

function parseAreas(subject) {
  const areaChunk = subject.split(' ')[0] || '';
  const areas = areaChunk.match(AREA_PATTERN);
  if (!areas) {
    return ['UNCATEGORIZED'];
  }

  return areas.map(area => area.substring(1, area.length - 1));
}

function parseCommits(logLines) {
  const commits = [];

  logLines.forEach(line => {
    let [subject, hash] = line.split(' &&& ');
    subject = subject.trim();

    const message = getCommitMessage(hash);
    const revertsHashes = parseRevertCommit(message);
    const areas = parseAreas(subject);

    commits.push({
      hash,
      areas,
      subject,
      message,
      revertsHashes,
    });
  });

  return commits;
}

module.exports = parseCommits;
