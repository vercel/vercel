function filterLog(logLines) {
  return logLines.filter(line => !line.startsWith('- Publish '));
}

module.exports = filterLog;
