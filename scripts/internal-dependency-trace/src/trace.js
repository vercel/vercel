const path = require('path');
const fs = require('fs');
const { stripRootDirectory } = require('./root-directory');

const addExtension = filePath => {
  if (filePath.endsWith('.json')) {
    return filePath;
  }

  if (!filePath.endsWith('.ts')) {
    try {
      fs.statSync(filePath); // its a directory, now try index.ts and index.js
      try {
        fs.statSync(filePath + '/index.ts')
        filePath += '/index.ts';
      } catch (e) {
        fs.statSync(filePath + '/index.js');
        filePath += '/index.js';
      }
    } catch (e) {
      try {
        fs.statSync(filePath + '.ts');
        filePath += '.ts';
      } catch (e2) {
        fs.statSync(filePath + '.js');
        filePath += '.js';
      }
    }
  }

  return filePath;
};

function trace(filePath) {
  const files = {};
  function _trace(_filePath) {
    if (_filePath.endsWith('.json') || files[stripRootDirectory(_filePath)]) {
      return;
    }

    const source = fs.readFileSync(_filePath, 'utf-8');
    const matches = source.matchAll(/(require|from).+["'].*\n/g);

    let localDepPaths = [...matches]
      .map(a => a[0])
      .map(b => /["'](\..*)["']/.exec(b))
      .filter(c => c != null)
      .map(d => addExtension(path.resolve(path.dirname(_filePath), d[1])));

    // de-duplicate
    localDepPaths = new Set(localDepPaths);
    localDepPaths = [...localDepPaths];

    files[stripRootDirectory(_filePath)] = {
      dependsOn: localDepPaths.map(stripRootDirectory),
    };

    for (const localDepPath of localDepPaths) {
      _trace(localDepPath);
    }
  }
  _trace(filePath);
  return files;
}

module.exports = { trace };
