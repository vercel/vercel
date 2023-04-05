import fs from 'fs';
import path from 'path';

function getPackageJSONPath(dir: string) {
  return path.join(dir, 'package.json');
}

export function getPackageJSON() {
  const _prepareStackTrace = Error.prepareStackTrace;

  Error.prepareStackTrace = (_, stack) => stack;

  // The `stack` reference above is of type `Array<NodeJS.CallSite>`
  const stack = new Error().stack as unknown as Array<NodeJS.CallSite>;

  Error.prepareStackTrace = _prepareStackTrace;

  // TypeScript rule noUncheckedIndexedAccess makes `stack[1]` potentially undefined;
  // however, we can safely assert it is not undefined as the callstack will always
  // have at least 2 entries, the first being this function, and the second wherever
  // its being called from.
  const callsite = stack[1]!;

  // it is guarranteed that the only way for `getFileName` to return `undefined` is if
  // this function is called using `eval` thus it is safe to assert `filePath` is defined
  // at this point.
  const filePath = (callsite.getFileName() ||
    callsite.getEvalOrigin()) as string; // get the file name of where this function was called

  let rootDir = path.dirname(filePath);

  let packageJSONPath = getPackageJSONPath(rootDir);
  while (!fs.existsSync(packageJSONPath)) {
    rootDir = path.join(rootDir, '..');
    packageJSONPath = getPackageJSONPath(rootDir);
  }

  const packageJSON = JSON.parse(fs.readFileSync(packageJSONPath, 'utf-8'));

  return packageJSON;
}
