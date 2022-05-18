import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { n as normalize, d as dirname } from './index3.mjs';

function getModulePaths(paths) {
  return [].concat(global.__NUXT_PREPATHS__, ...Array.isArray(paths) ? paths : [paths], process.cwd(), global.__NUXT_PATHS__).filter(Boolean);
}
const _require = createRequire(process.cwd());
function resolveModule(id, paths) {
  return normalize(_require.resolve(id, { paths: getModulePaths(paths) }));
}
function tryResolveModule(id, paths) {
  try {
    return resolveModule(id, paths);
  } catch {
    return null;
  }
}
function requireModule(id, paths) {
  return _require(resolveModule(id, paths));
}
function importModule(id, paths) {
  const resolvedPath = resolveModule(id, paths);
  return import(pathToFileURL(resolvedPath).href);
}
function getNearestPackage(id, paths) {
  while (dirname(id) !== id) {
    try {
      return requireModule(id + "/package.json", paths);
    } catch {
    }
    id = dirname(id);
  }
  return null;
}

export { getNearestPackage as a, getModulePaths as g, importModule as i, resolveModule as r, tryResolveModule as t };
