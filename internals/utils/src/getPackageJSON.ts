import fs from 'fs';
import path from 'path';

function getPackageJSONPath (dir: string) {
  return path.join(dir, 'package.json');
}

export function getPackageJSON<T>(): T {
  const _prepareStackTrace = Error.prepareStackTrace;

  Error.prepareStackTrace = (_, stack) => stack;

  // The `stack` reference above is of type `Array<NodeJS.CallSite>`
  const stack = (new Error().stack as unknown as Array<NodeJS.CallSite>).slice(1); // remove self from stack

  // TypeScript rule noUncheckedIndexedAccess makes `stack[0]` potentially undefined;
  // however, we can safely assert it is not undefined as the callstack will always
  // have atleast 2 entries (we slice the first above), and then rely on the second here.
  const filePath = stack[0]!.getFileName(); // get the file name of where this function was called

  // Furthermore, V8 api `CallSite.getFileName` could return `null`, but as long as this function
  // is always called from another script (which it has to be, since it is only defined here as
  // a named export), it will return a `string`.
  let rootDir = path.dirname(filePath!);

  let packageJSONPath = getPackageJSONPath(rootDir);
  while (!fs.existsSync(packageJSONPath)) {
    rootDir = path.join(rootDir, '..');
    packageJSONPath = getPackageJSONPath(rootDir);
  }

  Error.prepareStackTrace = _prepareStackTrace;
  const packageJSON = JSON.parse(fs.readFileSync(packageJSONPath, 'utf-8'));

  return packageJSON;
}
