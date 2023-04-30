const { readFileSync } = require('fs');
const { createHash } = require('crypto');
const { stripRootDirectory } = require('./root-directory');

const hash = p => {
  const h = createHash('sha1');
  h.update(p);
  return h.digest('hex');
};

const line = (p1, p2) =>
  ` ${hash(p1)}(${stripRootDirectory(p1)}) --> ${hash(p2)}(${stripRootDirectory(
    p2
  )})\n`;

function generateMermaidOutput(filePath, traceDataPath) {
  const traceData = JSON.parse(readFileSync(traceDataPath, 'utf-8'));
  const visited = new Set();
  let output = 'graph LR\n';
  function _generateMermaidOutput(_filePath) {
    if (!traceData[_filePath]) return;
    if (visited.has(hash(_filePath))) return;
    else visited.add(hash(_filePath));
    for (const dependency of traceData[_filePath].dependsOn) {
      output += line(_filePath, dependency);
      _generateMermaidOutput(dependency);
    }
  }
  _generateMermaidOutput(filePath);
  return output;
}

module.exports = {
  generateMermaidOutput,
};
