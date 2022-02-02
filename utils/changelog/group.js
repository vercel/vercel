function groupLog(commits) {
  const grouped = {};

  for (let commit of commits) {
    for (let area of commit.areas) {
      grouped[area] = grouped[area] || [];
      grouped[area].push(commit.subject);
    }
  }

  return grouped;
}

module.exports = groupLog;
