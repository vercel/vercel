const path = require('path');
const fs = require('fs');

const files = {}

const addExtension = (filePath) => {
  if (filePath.endsWith('.json')) {
    return filePath;
  }
  if (!filePath.endsWith('.ts')) {
    try {
      fs.statSync(filePath);
      filePath += '/index.ts';
    } catch (e) {
      try {
        fs.statSync(filePath + '.ts');
        filePath += '.ts';
      } catch (e2) {
        // TODO: sean added for `secrets.js` command
        fs.statSync(filePath + '.js');
        filePath += '.js';
      }
    }
  }
  return filePath;
}

function f (filePath) {
  if (filePath.endsWith('.json')) {
    return;
  }

  if (files[filePath]) {
    return;
  }

  const source = fs.readFileSync(filePath, 'utf-8');

  // TODO: sean updated regex
  const matches = source.matchAll(/(require|from).+["'].*\n/g);

  let localDepPaths = [...matches]
    .map(a => a[0])
    .map(b => /["'](\..*)["']/.exec(b))
    .filter(c => c != null)
    .map(d => addExtension(path.resolve(path.dirname(filePath),d[1])));

  localDepPaths = new Set(localDepPaths);
  localDepPaths = [...localDepPaths];

  files[filePath] = {
    dependsOn: localDepPaths
  };

  for (const localDepPath of localDepPaths) {
    f(localDepPath);
  }
}

f(path.resolve('./../../packages/cli/src/index.ts'))

fs.writeFileSync('fileGraph.json', JSON.stringify(files, null, 2))
