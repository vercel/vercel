function normalizeLog(logLines) {
  const trimmedLogLines = logLines.map(line => line.trim());
  return trimmedLogLines.filter(line => !line.startsWith('Publish '));
}

module.exports = normalizeLog;
