import fs from 'fs';
import path from 'path';

import callerPath from 'caller-path';

function getPackageJSONPath (dir: string) {
  return path.join(dir, 'package.json');
}

export function getPackageJSON(_rootDir?: string) {

  // Can't use ??= because of https://github.com/microsoft/TypeScript/issues/40359
  let rootDir = _rootDir ?? path.dirname(callerPath({ depth: 1 })!);
  let packageJSONPath = getPackageJSONPath(rootDir);
  while (!fs.existsSync(packageJSONPath)) {
    rootDir = path.join(rootDir, '..');
    packageJSONPath = getPackageJSONPath(rootDir);
  }

  return JSON.parse(fs.readFileSync(packageJSONPath, 'utf-8'))
}
