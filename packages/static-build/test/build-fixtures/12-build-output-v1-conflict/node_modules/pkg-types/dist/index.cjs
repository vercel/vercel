'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

const jsonc = require('jsonc-parser');
const fs = require('fs');
const pathe = require('pathe');
const mlly = require('mlly');

function _interopNamespace(e) {
  if (e && e.__esModule) return e;
  const n = Object.create(null);
  if (e) {
    for (const k in e) {
      n[k] = e[k];
    }
  }
  n["default"] = e;
  return n;
}

const jsonc__namespace = /*#__PURE__*/_interopNamespace(jsonc);

const defaultFindOptions = {
  startingFrom: ".",
  rootPattern: /^node_modules$/,
  test: (filePath) => {
    try {
      if (fs.statSync(filePath).isFile()) {
        return true;
      }
    } catch {
    }
    return null;
  }
};
async function findNearestFile(filename, _options = {}) {
  const options = { ...defaultFindOptions, ..._options };
  const basePath = pathe.resolve(options.startingFrom);
  const leadingSlash = basePath[0] === "/";
  const segments = basePath.split("/").filter(Boolean);
  if (leadingSlash) {
    segments[0] = "/" + segments[0];
  }
  let root = segments.findIndex((r) => r.match(options.rootPattern));
  if (root === -1)
    root = 0;
  for (let i = segments.length; i > root; i--) {
    const filePath = pathe.join(...segments.slice(0, i), filename);
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
  const blob = await fs.promises.readFile(resolvedPath, "utf-8");
  return JSON.parse(blob);
}
async function writePackageJSON(path, pkg) {
  await fs.promises.writeFile(path, JSON.stringify(pkg, null, 2));
}
async function readTSConfig(id, opts = {}) {
  const resolvedPath = await resolveTSConfig(id, opts);
  const blob = await fs.promises.readFile(resolvedPath, "utf-8");
  return jsonc__namespace.parse(blob);
}
async function writeTSConfig(path, tsconfig) {
  await fs.promises.writeFile(path, JSON.stringify(tsconfig, null, 2));
}
async function resolvePackageJSON(id = process.cwd(), opts = {}) {
  const resolvedPath = pathe.isAbsolute(id) ? id : await mlly.resolvePath(id, opts);
  return findNearestFile("package.json", { startingFrom: resolvedPath, ...opts });
}
async function resolveTSConfig(id = process.cwd(), opts = {}) {
  const resolvedPath = pathe.isAbsolute(id) ? id : await mlly.resolvePath(id, opts);
  return findNearestFile("tsconfig.json", { startingFrom: resolvedPath, ...opts });
}

exports.definePackageJSON = definePackageJSON;
exports.defineTSConfig = defineTSConfig;
exports.findNearestFile = findNearestFile;
exports.readPackageJSON = readPackageJSON;
exports.readTSConfig = readTSConfig;
exports.resolvePackageJSON = resolvePackageJSON;
exports.resolveTSConfig = resolveTSConfig;
exports.writePackageJSON = writePackageJSON;
exports.writeTSConfig = writeTSConfig;
