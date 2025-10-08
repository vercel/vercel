import fs from 'fs';
import path from 'path';

const cache = new Map();

function getPackageJSONPath(dir: string) {
  return path.join(dir, 'package.json');
}

function captureCallerCallSite() {
  const _prepareStackTrace = Error.prepareStackTrace;

  let callSite;
  try {
    Error.prepareStackTrace = (_, stack) => stack;

    // The `stack` reference above is of type `Array<NodeJS.CallSite>`
    const callSites = new Error().stack as unknown as Array<NodeJS.CallSite>;

    // TypeScript rule noUncheckedIndexedAccess makes `callSites[2]` potentially
    // undefined; however, we can safely assert it is not undefined as the
    // callstack will always have at least 3 entries, the first being this
    // function, the second being `getPackageJSON`, and the third wherever its
    // being called from.
    callSite = callSites[2]!;
  } finally {
    Error.prepareStackTrace = _prepareStackTrace;
  }

  return callSite;
}

export function getPackageJSON() {
  const callSite = captureCallerCallSite();
  // Get the file name of where this function was called. It is guaranteed that
  // the only way for `getFileName` to return `undefined` is if this function is
  // called using `eval` thus it is safe to assert `filePath` is defined at this
  // point.
  const filePath = (callSite.getFileName() ||
    callSite.getEvalOrigin()) as string;

  let rootDir = path.dirname(filePath);

  let packageJSONPath = getPackageJSONPath(rootDir);
  while (!fs.existsSync(packageJSONPath)) {
    rootDir = path.join(rootDir, '..');
    packageJSONPath = getPackageJSONPath(rootDir);
  }

  let packageJSON = cache.get(packageJSONPath);

  if (!packageJSON) {
    packageJSON = JSON.parse(fs.readFileSync(packageJSONPath, 'utf-8'));
    cache.set(packageJSONPath, packageJSON);
  }

  return packageJSON;
}
