import * as jsonc from 'jsonc-parser';
import { statSync, promises } from 'fs';
import { resolve, join, isAbsolute } from 'pathe';
import { resolvePath } from 'mlly';

const defaultFindOptions = {
  startingFrom: ".",
  rootPattern: /^node_modules$/,
  test: (filePath) => {
    try {
      if (statSync(filePath).isFile()) {
        return true;
      }
    } catch {
    }
    return null;
  }
};
async function findNearestFile(filename, _options = {}) {
  const options = { ...defaultFindOptions, ..._options };
  const basePath = resolve(options.startingFrom);
  const leadingSlash = basePath[0] === "/";
  const segments = basePath.split("/").filter(Boolean);
  if (leadingSlash) {
    segments[0] = "/" + segments[0];
  }
  let root = segments.findIndex((r) => r.match(options.rootPattern));
  if (root === -1)
    root = 0;
  for (let i = segments.length; i > root; i--) {
    const filePath = join(...segments.slice(0, i), filename);
    if (await options.test(filePath)) {
      return filePath;
    }
  }
  throw new Error(`Cannot find matching ${filename} in ${options.startingFrom} or parent directories`);
}

function definePackageJSON(pkg) {
  return pkg;
}
function defineTSConfig(tsconfig) {
  return tsconfig;
}
async function readPackageJSON(id, opts = {}) {
  const resolvedPath = await resolvePackageJSON(id, opts);
  const blob = await promises.readFile(resolvedPath, "utf-8");
  return JSON.parse(blob);
}
async function writePackageJSON(path, pkg) {
  await promises.writeFile(path, JSON.stringify(pkg, null, 2));
}
async function readTSConfig(id, opts = {}) {
  const resolvedPath = await resolveTSConfig(id, opts);
  const blob = await promises.readFile(resolvedPath, "utf-8");
  return jsonc.parse(blob);
}
async function writeTSConfig(path, tsconfig) {
  await promises.writeFile(path, JSON.stringify(tsconfig, null, 2));
}
async function resolvePackageJSON(id = process.cwd(), opts = {}) {
  const resolvedPath = isAbsolute(id) ? id : await resolvePath(id, opts);
  return findNearestFile("package.json", { startingFrom: resolvedPath, ...opts });
}
async function resolveTSConfig(id = process.cwd(), opts = {}) {
  const resolvedPath = isAbsolute(id) ? id : await resolvePath(id, opts);
  return findNearestFile("tsconfig.json", { startingFrom: resolvedPath, ...opts });
}

export { definePackageJSON, defineTSConfig, findNearestFile, readPackageJSON, readTSConfig, resolvePackageJSON, resolveTSConfig, writePackageJSON, writeTSConfig };
