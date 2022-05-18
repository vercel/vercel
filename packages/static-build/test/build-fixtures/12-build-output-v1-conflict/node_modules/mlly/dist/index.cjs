'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

const module$1 = require('module');
const path = require('path');
const url = require('url');
const fs = require('fs');
const pathe = require('pathe');
const assert = require('assert');
const util = require('util');
const pkgTypes = require('pkg-types');

function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e["default"] : e; }

const path__default = /*#__PURE__*/_interopDefaultLegacy(path);
const fs__default = /*#__PURE__*/_interopDefaultLegacy(fs);
const assert__default = /*#__PURE__*/_interopDefaultLegacy(assert);

const BUILTIN_MODULES = new Set(module$1.builtinModules);
function normalizeSlash(str) {
  return str.replace(/\\/g, "/");
}
function pcall(fn, ...args) {
  try {
    return Promise.resolve(fn(...args)).catch((err) => perr(err));
  } catch (err) {
    return perr(err);
  }
}
function perr(_err) {
  const err = new Error(_err);
  err.code = _err.code;
  Error.captureStackTrace(err, pcall);
  return Promise.reject(err);
}
function isObject(val) {
  return val !== null && typeof val === "object";
}
function matchAll(regex, string, addition) {
  const matches = [];
  for (const match of string.matchAll(regex)) {
    matches.push({
      ...addition,
      ...match.groups,
      code: match[0],
      start: match.index,
      end: match.index + match[0].length
    });
  }
  return matches;
}

const ESM_STATIC_IMPORT_RE = /(?<=\s|^|;)import\s*(["'\s]*(?<imports>[\w*${}\n\r\t, /]+)from\s*)?["']\s*(?<specifier>(?<="\s*)[^"]*[^"\s](?=\s*")|(?<='\s*)[^']*[^'\s](?=\s*'))\s*["'][\s;]*/gm;
const DYNAMIC_IMPORT_RE = /import\s*\((?<expression>(?:[^)(]+|\((?:[^)(]+|\([^)(]*\))*\))*)\)/gm;
const EXPORT_DECAL_RE = /\bexport\s+(?<declaration>(async function|function|let|const|var|class))\s+(?<name>[\w$_]+)/g;
const EXPORT_NAMED_RE = /\bexport\s+{(?<exports>[^}]+)}(\s*from\s*["']\s*(?<specifier>(?<="\s*)[^"]*[^"\s](?=\s*")|(?<='\s*)[^']*[^'\s](?=\s*'))\s*["'][^\n]*)?/g;
const EXPORT_STAR_RE = /\bexport\s*(\*)\s*(\s*from\s*["']\s*(?<specifier>(?<="\s*)[^"]*[^"\s](?=\s*")|(?<='\s*)[^']*[^'\s](?=\s*'))\s*["'][^\n]*)?/g;
const EXPORT_DEFAULT_RE = /\bexport\s+default\s+/g;
function findStaticImports(code) {
  return matchAll(ESM_STATIC_IMPORT_RE, code, { type: "static" });
}
function findDynamicImports(code) {
  return matchAll(DYNAMIC_IMPORT_RE, code, { type: "dynamic" });
}
function parseStaticImport(matched) {
  const cleanedImports = (matched.imports || "").replace(/(\/\/[^\n]*\n|\/\*.*\*\/)/g, "").replace(/\s+/g, " ");
  const namedImports = {};
  for (const namedImport of cleanedImports.match(/\{([^}]*)\}/)?.[1]?.split(",") || []) {
    const [, source = namedImport.trim(), importName = source] = namedImport.match(/^\s*([^\s]*) as ([^\s]*)\s*$/) || [];
    if (source) {
      namedImports[source] = importName;
    }
  }
  const topLevelImports = cleanedImports.replace(/\{([^}]*)\}/, "");
  const namespacedImport = topLevelImports.match(/\* as \s*([^\s]*)/)?.[1];
  const defaultImport = topLevelImports.split(",").find((i) => !i.match(/[*{}]/))?.trim() || void 0;
  return {
    ...matched,
    defaultImport,
    namespacedImport,
    namedImports
  };
}
function findExports(code) {
  const declaredExports = matchAll(EXPORT_DECAL_RE, code, { type: "declaration" });
  const namedExports = matchAll(EXPORT_NAMED_RE, code, { type: "named" });
  for (const namedExport of namedExports) {
    namedExport.names = namedExport.exports.split(/\s*,\s*/g).map((name) => name.replace(/^.*?\sas\s/, "").trim());
  }
  const defaultExport = matchAll(EXPORT_DEFAULT_RE, code, { type: "default", name: "default" });
  const starExports = matchAll(EXPORT_STAR_RE, code, { type: "star" });
  const exports = [].concat(declaredExports, namedExports, defaultExport, starExports);
  for (const exp of exports) {
    if (!exp.name && exp.names && exp.names.length === 1) {
      exp.name = exp.names[0];
    }
    if (exp.name === "default" && exp.type !== "default") {
      exp._type = exp.type;
      exp.type = "default";
    }
    if (!exp.names && exp.name) {
      exp.names = [exp.name];
    }
  }
  return exports.filter((exp, index, exports2) => {
    const nextExport = exports2[index + 1];
    return !nextExport || exp.type !== nextExport.type || exp.name !== nextExport.name;
  });
}

function fileURLToPath(id) {
  if (typeof id === "string" && !id.startsWith("file://")) {
    return normalizeSlash(id);
  }
  return normalizeSlash(url.fileURLToPath(id));
}
const INVALID_CHAR_RE = /[\x00-\x1F\x7F<>*#"{}|^[\]`;/?:@&=+$,]+/g;
function sanitizeURIComponent(name = "", replacement = "_") {
  return name.replace(INVALID_CHAR_RE, replacement);
}
function sanitizeFilePath(filePath = "") {
  return filePath.split(/[/\\]/g).map((p) => sanitizeURIComponent(p)).join("/").replace(/^([a-zA-Z])_\//, "$1:/");
}
function normalizeid(id) {
  if (typeof id !== "string") {
    id = id.toString();
  }
  if (/(node|data|http|https|file):/.test(id)) {
    return id;
  }
  if (BUILTIN_MODULES.has(id)) {
    return "node:" + id;
  }
  return "file://" + normalizeSlash(id);
}
async function loadURL(url) {
  const code = await fs.promises.readFile(fileURLToPath(url), "utf-8");
  return code;
}
function toDataURL(code) {
  const base64 = Buffer.from(code).toString("base64");
  return `data:text/javascript;base64,${base64}`;
}
function isNodeBuiltin(id = "") {
  id = id.replace(/^node:/, "").split("/")[0];
  return BUILTIN_MODULES.has(id);
}
const ProtocolRegex = /^(?<proto>.{2,}?):.+$/;
function getProtocol(id) {
  const proto = id.match(ProtocolRegex);
  return proto ? proto.groups.proto : null;
}

function createCommonJS(url) {
  const __filename = fileURLToPath(url);
  const __dirname = path.dirname(__filename);
  let _nativeRequire;
  const getNativeRequire = () => _nativeRequire || (_nativeRequire = module$1.createRequire(url));
  function require(id) {
    return getNativeRequire()(id);
  }
  require.resolve = (id, options) => getNativeRequire().resolve(id, options);
  return {
    __filename,
    __dirname,
    require
  };
}
function interopDefault(sourceModule) {
  if (!isObject(sourceModule) || !("default" in sourceModule)) {
    return sourceModule;
  }
  const newModule = sourceModule.default;
  for (const key in sourceModule) {
    if (key === "default") {
      try {
        if (!(key in newModule)) {
          Object.defineProperty(newModule, key, {
            enumerable: false,
            configurable: false,
            get() {
              return newModule;
            }
          });
        }
      } catch (_err) {
      }
    } else {
      try {
        if (!(key in newModule)) {
          Object.defineProperty(newModule, key, {
            enumerable: true,
            configurable: true,
            get() {
              return sourceModule[key];
            }
          });
        }
      } catch (_err) {
      }
    }
  }
  return newModule;
}

const reader = { read };
const packageJsonReader = reader;
function read(jsonPath) {
  return find(path__default.dirname(jsonPath));
}
function find(dir) {
  try {
    const string = fs__default.readFileSync(path__default.toNamespacedPath(path__default.join(dir, "package.json")), "utf8");
    return { string };
  } catch (error) {
    if (error.code === "ENOENT") {
      const parent = path__default.dirname(dir);
      if (dir !== parent) {
        return find(parent);
      }
      return { string: void 0 };
    }
    throw error;
  }
}

const isWindows = process.platform === "win32";
const own$1 = {}.hasOwnProperty;
const codes = {};
const messages = /* @__PURE__ */ new Map();
const nodeInternalPrefix = "__node_internal_";
let userStackTraceLimit;
codes.ERR_INVALID_MODULE_SPECIFIER = createError("ERR_INVALID_MODULE_SPECIFIER", (request, reason, base = void 0) => {
  return `Invalid module "${request}" ${reason}${base ? ` imported from ${base}` : ""}`;
}, TypeError);
codes.ERR_INVALID_PACKAGE_CONFIG = createError("ERR_INVALID_PACKAGE_CONFIG", (path, base, message) => {
  return `Invalid package config ${path}${base ? ` while importing ${base}` : ""}${message ? `. ${message}` : ""}`;
}, Error);
codes.ERR_INVALID_PACKAGE_TARGET = createError("ERR_INVALID_PACKAGE_TARGET", (pkgPath, key, target, isImport = false, base = void 0) => {
  const relError = typeof target === "string" && !isImport && target.length > 0 && !target.startsWith("./");
  if (key === ".") {
    assert__default(isImport === false);
    return `Invalid "exports" main target ${JSON.stringify(target)} defined in the package config ${pkgPath}package.json${base ? ` imported from ${base}` : ""}${relError ? '; targets must start with "./"' : ""}`;
  }
  return `Invalid "${isImport ? "imports" : "exports"}" target ${JSON.stringify(target)} defined for '${key}' in the package config ${pkgPath}package.json${base ? ` imported from ${base}` : ""}${relError ? '; targets must start with "./"' : ""}`;
}, Error);
codes.ERR_MODULE_NOT_FOUND = createError("ERR_MODULE_NOT_FOUND", (path, base, type = "package") => {
  return `Cannot find ${type} '${path}' imported from ${base}`;
}, Error);
codes.ERR_PACKAGE_IMPORT_NOT_DEFINED = createError("ERR_PACKAGE_IMPORT_NOT_DEFINED", (specifier, packagePath, base) => {
  return `Package import specifier "${specifier}" is not defined${packagePath ? ` in package ${packagePath}package.json` : ""} imported from ${base}`;
}, TypeError);
codes.ERR_PACKAGE_PATH_NOT_EXPORTED = createError("ERR_PACKAGE_PATH_NOT_EXPORTED", (pkgPath, subpath, base = void 0) => {
  if (subpath === ".") {
    return `No "exports" main defined in ${pkgPath}package.json${base ? ` imported from ${base}` : ""}`;
  }
  return `Package subpath '${subpath}' is not defined by "exports" in ${pkgPath}package.json${base ? ` imported from ${base}` : ""}`;
}, Error);
codes.ERR_UNSUPPORTED_DIR_IMPORT = createError("ERR_UNSUPPORTED_DIR_IMPORT", "Directory import '%s' is not supported resolving ES modules imported from %s", Error);
codes.ERR_UNKNOWN_FILE_EXTENSION = createError("ERR_UNKNOWN_FILE_EXTENSION", 'Unknown file extension "%s" for %s', TypeError);
codes.ERR_INVALID_ARG_VALUE = createError("ERR_INVALID_ARG_VALUE", (name, value, reason = "is invalid") => {
  let inspected = util.inspect(value);
  if (inspected.length > 128) {
    inspected = `${inspected.slice(0, 128)}...`;
  }
  const type = name.includes(".") ? "property" : "argument";
  return `The ${type} '${name}' ${reason}. Received ${inspected}`;
}, TypeError);
codes.ERR_UNSUPPORTED_ESM_URL_SCHEME = createError("ERR_UNSUPPORTED_ESM_URL_SCHEME", (url) => {
  let message = "Only file and data URLs are supported by the default ESM loader";
  if (isWindows && url.protocol.length === 2) {
    message += ". On Windows, absolute paths must be valid file:// URLs";
  }
  message += `. Received protocol '${url.protocol}'`;
  return message;
}, Error);
function createError(sym, value, def) {
  messages.set(sym, value);
  return makeNodeErrorWithCode(def, sym);
}
function makeNodeErrorWithCode(Base, key) {
  return NodeError;
  function NodeError(...args) {
    const limit = Error.stackTraceLimit;
    if (isErrorStackTraceLimitWritable()) {
      Error.stackTraceLimit = 0;
    }
    const error = new Base();
    if (isErrorStackTraceLimitWritable()) {
      Error.stackTraceLimit = limit;
    }
    const message = getMessage(key, args, error);
    Object.defineProperty(error, "message", {
      value: message,
      enumerable: false,
      writable: true,
      configurable: true
    });
    Object.defineProperty(error, "toString", {
      value() {
        return `${this.name} [${key}]: ${this.message}`;
      },
      enumerable: false,
      writable: true,
      configurable: true
    });
    addCodeToName(error, Base.name, key);
    error.code = key;
    return error;
  }
}
const addCodeToName = hideStackFrames(function(error, name, code) {
  error = captureLargerStackTrace(error);
  error.name = `${name} [${code}]`;
  error.stack;
  if (name === "SystemError") {
    Object.defineProperty(error, "name", {
      value: name,
      enumerable: false,
      writable: true,
      configurable: true
    });
  } else {
    delete error.name;
  }
});
function isErrorStackTraceLimitWritable() {
  const desc = Object.getOwnPropertyDescriptor(Error, "stackTraceLimit");
  if (desc === void 0) {
    return Object.isExtensible(Error);
  }
  return own$1.call(desc, "writable") ? desc.writable : desc.set !== void 0;
}
function hideStackFrames(fn) {
  const hidden = nodeInternalPrefix + fn.name;
  Object.defineProperty(fn, "name", { value: hidden });
  return fn;
}
const captureLargerStackTrace = hideStackFrames(function(error) {
  const stackTraceLimitIsWritable = isErrorStackTraceLimitWritable();
  if (stackTraceLimitIsWritable) {
    userStackTraceLimit = Error.stackTraceLimit;
    Error.stackTraceLimit = Number.POSITIVE_INFINITY;
  }
  Error.captureStackTrace(error);
  if (stackTraceLimitIsWritable) {
    Error.stackTraceLimit = userStackTraceLimit;
  }
  return error;
});
function getMessage(key, args, self) {
  const message = messages.get(key);
  if (typeof message === "function") {
    assert__default(message.length <= args.length, `Code: ${key}; The provided arguments length (${args.length}) does not match the required ones (${message.length}).`);
    return Reflect.apply(message, self, args);
  }
  const expectedLength = (message.match(/%[dfijoOs]/g) || []).length;
  assert__default(expectedLength === args.length, `Code: ${key}; The provided arguments length (${args.length}) does not match the required ones (${expectedLength}).`);
  if (args.length === 0) {
    return message;
  }
  args.unshift(message);
  return Reflect.apply(util.format, null, args);
}

const { ERR_UNKNOWN_FILE_EXTENSION } = codes;
const extensionFormatMap = {
  __proto__: null,
  ".cjs": "commonjs",
  ".js": "module",
  ".mjs": "module"
};
function defaultGetFormat(url$1) {
  if (url$1.startsWith("node:")) {
    return { format: "builtin" };
  }
  const parsed = new url.URL(url$1);
  if (parsed.protocol === "data:") {
    const { 1: mime } = /^([^/]+\/[^;,]+)[^,]*?(;base64)?,/.exec(parsed.pathname) || [null, null];
    const format = mime === "text/javascript" ? "module" : null;
    return { format };
  }
  if (parsed.protocol === "file:") {
    const ext = path__default.extname(parsed.pathname);
    let format;
    if (ext === ".js") {
      format = getPackageType(parsed.href) === "module" ? "module" : "commonjs";
    } else {
      format = extensionFormatMap[ext];
    }
    if (!format) {
      throw new ERR_UNKNOWN_FILE_EXTENSION(ext, url.fileURLToPath(url$1));
    }
    return { format: format || null };
  }
  return { format: null };
}

const {
  ERR_INVALID_MODULE_SPECIFIER,
  ERR_INVALID_PACKAGE_CONFIG,
  ERR_INVALID_PACKAGE_TARGET,
  ERR_MODULE_NOT_FOUND,
  ERR_PACKAGE_IMPORT_NOT_DEFINED,
  ERR_PACKAGE_PATH_NOT_EXPORTED,
  ERR_UNSUPPORTED_DIR_IMPORT,
  ERR_UNSUPPORTED_ESM_URL_SCHEME,
  ERR_INVALID_ARG_VALUE
} = codes;
const own = {}.hasOwnProperty;
Object.freeze(["node", "import"]);
const invalidSegmentRegEx = /(^|\\|\/)(\.\.?|node_modules)(\\|\/|$)/;
const patternRegEx = /\*/g;
const encodedSepRegEx = /%2f|%2c/i;
const emittedPackageWarnings = /* @__PURE__ */ new Set();
const packageJsonCache = /* @__PURE__ */ new Map();
function emitFolderMapDeprecation(match, pjsonUrl, isExports, base) {
  const pjsonPath = url.fileURLToPath(pjsonUrl);
  if (emittedPackageWarnings.has(pjsonPath + "|" + match)) {
    return;
  }
  emittedPackageWarnings.add(pjsonPath + "|" + match);
  process.emitWarning(`Use of deprecated folder mapping "${match}" in the ${isExports ? '"exports"' : '"imports"'} field module resolution of the package at ${pjsonPath}${base ? ` imported from ${url.fileURLToPath(base)}` : ""}.
Update this package.json to use a subpath pattern like "${match}*".`, "DeprecationWarning", "DEP0148");
}
function emitLegacyIndexDeprecation(url$1, packageJsonUrl, base, main) {
  const { format } = defaultGetFormat(url$1.href);
  if (format !== "module") {
    return;
  }
  const path2 = url.fileURLToPath(url$1.href);
  const pkgPath = url.fileURLToPath(new URL(".", packageJsonUrl));
  const basePath = url.fileURLToPath(base);
  if (main) {
    process.emitWarning(`Package ${pkgPath} has a "main" field set to ${JSON.stringify(main)}, excluding the full filename and extension to the resolved file at "${path2.slice(pkgPath.length)}", imported from ${basePath}.
 Automatic extension resolution of the "main" field isdeprecated for ES modules.`, "DeprecationWarning", "DEP0151");
  } else {
    process.emitWarning(`No "main" or "exports" field defined in the package.json for ${pkgPath} resolving the main entry point "${path2.slice(pkgPath.length)}", imported from ${basePath}.
Default "index" lookups for the main are deprecated for ES modules.`, "DeprecationWarning", "DEP0151");
  }
}
function tryStatSync(path2) {
  try {
    return fs.statSync(path2);
  } catch {
    return new fs.Stats();
  }
}
function getPackageConfig(path2, specifier, base) {
  const existing = packageJsonCache.get(path2);
  if (existing !== void 0) {
    return existing;
  }
  const source = packageJsonReader.read(path2).string;
  if (source === void 0) {
    const packageConfig2 = {
      pjsonPath: path2,
      exists: false,
      main: void 0,
      name: void 0,
      type: "none",
      exports: void 0,
      imports: void 0
    };
    packageJsonCache.set(path2, packageConfig2);
    return packageConfig2;
  }
  let packageJson;
  try {
    packageJson = JSON.parse(source);
  } catch (error) {
    throw new ERR_INVALID_PACKAGE_CONFIG(path2, (base ? `"${specifier}" from ` : "") + url.fileURLToPath(base || specifier), error.message);
  }
  const { exports, imports, main, name, type } = packageJson;
  const packageConfig = {
    pjsonPath: path2,
    exists: true,
    main: typeof main === "string" ? main : void 0,
    name: typeof name === "string" ? name : void 0,
    type: type === "module" || type === "commonjs" ? type : "none",
    exports,
    imports: imports && typeof imports === "object" ? imports : void 0
  };
  packageJsonCache.set(path2, packageConfig);
  return packageConfig;
}
function getPackageScopeConfig(resolved) {
  let packageJsonUrl = new URL("./package.json", resolved);
  while (true) {
    const packageJsonPath2 = packageJsonUrl.pathname;
    if (packageJsonPath2.endsWith("node_modules/package.json")) {
      break;
    }
    const packageConfig2 = getPackageConfig(url.fileURLToPath(packageJsonUrl), resolved);
    if (packageConfig2.exists) {
      return packageConfig2;
    }
    const lastPackageJsonUrl = packageJsonUrl;
    packageJsonUrl = new URL("../package.json", packageJsonUrl);
    if (packageJsonUrl.pathname === lastPackageJsonUrl.pathname) {
      break;
    }
  }
  const packageJsonPath = url.fileURLToPath(packageJsonUrl);
  const packageConfig = {
    pjsonPath: packageJsonPath,
    exists: false,
    main: void 0,
    name: void 0,
    type: "none",
    exports: void 0,
    imports: void 0
  };
  packageJsonCache.set(packageJsonPath, packageConfig);
  return packageConfig;
}
function fileExists(url$1) {
  return tryStatSync(url.fileURLToPath(url$1)).isFile();
}
function legacyMainResolve(packageJsonUrl, packageConfig, base) {
  let guess;
  if (packageConfig.main !== void 0) {
    guess = new URL(`./${packageConfig.main}`, packageJsonUrl);
    if (fileExists(guess)) {
      return guess;
    }
    const tries2 = [
      `./${packageConfig.main}.js`,
      `./${packageConfig.main}.json`,
      `./${packageConfig.main}.node`,
      `./${packageConfig.main}/index.js`,
      `./${packageConfig.main}/index.json`,
      `./${packageConfig.main}/index.node`
    ];
    let i2 = -1;
    while (++i2 < tries2.length) {
      guess = new URL(tries2[i2], packageJsonUrl);
      if (fileExists(guess)) {
        break;
      }
      guess = void 0;
    }
    if (guess) {
      emitLegacyIndexDeprecation(guess, packageJsonUrl, base, packageConfig.main);
      return guess;
    }
  }
  const tries = ["./index.js", "./index.json", "./index.node"];
  let i = -1;
  while (++i < tries.length) {
    guess = new URL(tries[i], packageJsonUrl);
    if (fileExists(guess)) {
      break;
    }
    guess = void 0;
  }
  if (guess) {
    emitLegacyIndexDeprecation(guess, packageJsonUrl, base, packageConfig.main);
    return guess;
  }
  throw new ERR_MODULE_NOT_FOUND(url.fileURLToPath(new URL(".", packageJsonUrl)), url.fileURLToPath(base));
}
function finalizeResolution(resolved, base) {
  if (encodedSepRegEx.test(resolved.pathname)) {
    throw new ERR_INVALID_MODULE_SPECIFIER(resolved.pathname, 'must not include encoded "/" or "\\" characters', url.fileURLToPath(base));
  }
  const path2 = url.fileURLToPath(resolved);
  const stats = tryStatSync(path2.endsWith("/") ? path2.slice(-1) : path2);
  if (stats.isDirectory()) {
    const error = new ERR_UNSUPPORTED_DIR_IMPORT(path2, url.fileURLToPath(base));
    error.url = String(resolved);
    throw error;
  }
  if (!stats.isFile()) {
    throw new ERR_MODULE_NOT_FOUND(path2 || resolved.pathname, base && url.fileURLToPath(base), "module");
  }
  return resolved;
}
function throwImportNotDefined(specifier, packageJsonUrl, base) {
  throw new ERR_PACKAGE_IMPORT_NOT_DEFINED(specifier, packageJsonUrl && url.fileURLToPath(new URL(".", packageJsonUrl)), url.fileURLToPath(base));
}
function throwExportsNotFound(subpath, packageJsonUrl, base) {
  throw new ERR_PACKAGE_PATH_NOT_EXPORTED(url.fileURLToPath(new URL(".", packageJsonUrl)), subpath, base && url.fileURLToPath(base));
}
function throwInvalidSubpath(subpath, packageJsonUrl, internal, base) {
  const reason = `request is not a valid subpath for the "${internal ? "imports" : "exports"}" resolution of ${url.fileURLToPath(packageJsonUrl)}`;
  throw new ERR_INVALID_MODULE_SPECIFIER(subpath, reason, base && url.fileURLToPath(base));
}
function throwInvalidPackageTarget(subpath, target, packageJsonUrl, internal, base) {
  target = typeof target === "object" && target !== null ? JSON.stringify(target, null, "") : `${target}`;
  throw new ERR_INVALID_PACKAGE_TARGET(url.fileURLToPath(new URL(".", packageJsonUrl)), subpath, target, internal, base && url.fileURLToPath(base));
}
function resolvePackageTargetString(target, subpath, match, packageJsonUrl, base, pattern, internal, conditions) {
  if (subpath !== "" && !pattern && target[target.length - 1] !== "/") {
    throwInvalidPackageTarget(match, target, packageJsonUrl, internal, base);
  }
  if (!target.startsWith("./")) {
    if (internal && !target.startsWith("../") && !target.startsWith("/")) {
      let isURL = false;
      try {
        new URL(target);
        isURL = true;
      } catch {
      }
      if (!isURL) {
        const exportTarget = pattern ? target.replace(patternRegEx, subpath) : target + subpath;
        return packageResolve(exportTarget, packageJsonUrl, conditions);
      }
    }
    throwInvalidPackageTarget(match, target, packageJsonUrl, internal, base);
  }
  if (invalidSegmentRegEx.test(target.slice(2))) {
    throwInvalidPackageTarget(match, target, packageJsonUrl, internal, base);
  }
  const resolved = new URL(target, packageJsonUrl);
  const resolvedPath = resolved.pathname;
  const packagePath = new URL(".", packageJsonUrl).pathname;
  if (!resolvedPath.startsWith(packagePath)) {
    throwInvalidPackageTarget(match, target, packageJsonUrl, internal, base);
  }
  if (subpath === "") {
    return resolved;
  }
  if (invalidSegmentRegEx.test(subpath)) {
    throwInvalidSubpath(match + subpath, packageJsonUrl, internal, base);
  }
  if (pattern) {
    return new URL(resolved.href.replace(patternRegEx, subpath));
  }
  return new URL(subpath, resolved);
}
function isArrayIndex(key) {
  const keyNumber = Number(key);
  if (`${keyNumber}` !== key) {
    return false;
  }
  return keyNumber >= 0 && keyNumber < 4294967295;
}
function resolvePackageTarget(packageJsonUrl, target, subpath, packageSubpath, base, pattern, internal, conditions) {
  if (typeof target === "string") {
    return resolvePackageTargetString(target, subpath, packageSubpath, packageJsonUrl, base, pattern, internal, conditions);
  }
  if (Array.isArray(target)) {
    const targetList = target;
    if (targetList.length === 0) {
      return null;
    }
    let lastException;
    let i = -1;
    while (++i < targetList.length) {
      const targetItem = targetList[i];
      let resolved;
      try {
        resolved = resolvePackageTarget(packageJsonUrl, targetItem, subpath, packageSubpath, base, pattern, internal, conditions);
      } catch (error) {
        lastException = error;
        if (error.code === "ERR_INVALID_PACKAGE_TARGET") {
          continue;
        }
        throw error;
      }
      if (resolved === void 0) {
        continue;
      }
      if (resolved === null) {
        lastException = null;
        continue;
      }
      return resolved;
    }
    if (lastException === void 0 || lastException === null) {
      return lastException;
    }
    throw lastException;
  }
  if (typeof target === "object" && target !== null) {
    const keys = Object.getOwnPropertyNames(target);
    let i = -1;
    while (++i < keys.length) {
      const key = keys[i];
      if (isArrayIndex(key)) {
        throw new ERR_INVALID_PACKAGE_CONFIG(url.fileURLToPath(packageJsonUrl), base, '"exports" cannot contain numeric property keys.');
      }
    }
    i = -1;
    while (++i < keys.length) {
      const key = keys[i];
      if (key === "default" || conditions && conditions.has(key)) {
        const conditionalTarget = target[key];
        const resolved = resolvePackageTarget(packageJsonUrl, conditionalTarget, subpath, packageSubpath, base, pattern, internal, conditions);
        if (resolved === void 0) {
          continue;
        }
        return resolved;
      }
    }
    return void 0;
  }
  if (target === null) {
    return null;
  }
  throwInvalidPackageTarget(packageSubpath, target, packageJsonUrl, internal, base);
}
function isConditionalExportsMainSugar(exports, packageJsonUrl, base) {
  if (typeof exports === "string" || Array.isArray(exports)) {
    return true;
  }
  if (typeof exports !== "object" || exports === null) {
    return false;
  }
  const keys = Object.getOwnPropertyNames(exports);
  let isConditionalSugar = false;
  let i = 0;
  let j = -1;
  while (++j < keys.length) {
    const key = keys[j];
    const curIsConditionalSugar = key === "" || key[0] !== ".";
    if (i++ === 0) {
      isConditionalSugar = curIsConditionalSugar;
    } else if (isConditionalSugar !== curIsConditionalSugar) {
      throw new ERR_INVALID_PACKAGE_CONFIG(url.fileURLToPath(packageJsonUrl), base, `"exports" cannot contain some keys starting with '.' and some not. The exports object must either be an object of package subpath keys or an object of main entry condition name keys only.`);
    }
  }
  return isConditionalSugar;
}
function packageExportsResolve(packageJsonUrl, packageSubpath, packageConfig, base, conditions) {
  let exports = packageConfig.exports;
  if (isConditionalExportsMainSugar(exports, packageJsonUrl, base)) {
    exports = { ".": exports };
  }
  if (own.call(exports, packageSubpath)) {
    const target = exports[packageSubpath];
    const resolved = resolvePackageTarget(packageJsonUrl, target, "", packageSubpath, base, false, false, conditions);
    if (resolved === null || resolved === void 0) {
      throwExportsNotFound(packageSubpath, packageJsonUrl, base);
    }
    return { resolved, exact: true };
  }
  let bestMatch = "";
  const keys = Object.getOwnPropertyNames(exports);
  let i = -1;
  while (++i < keys.length) {
    const key = keys[i];
    if (key[key.length - 1] === "*" && packageSubpath.startsWith(key.slice(0, -1)) && packageSubpath.length >= key.length && key.length > bestMatch.length) {
      bestMatch = key;
    } else if (key[key.length - 1] === "/" && packageSubpath.startsWith(key) && key.length > bestMatch.length) {
      bestMatch = key;
    }
  }
  if (bestMatch) {
    const target = exports[bestMatch];
    const pattern = bestMatch[bestMatch.length - 1] === "*";
    const subpath = packageSubpath.slice(bestMatch.length - (pattern ? 1 : 0));
    const resolved = resolvePackageTarget(packageJsonUrl, target, subpath, bestMatch, base, pattern, false, conditions);
    if (resolved === null || resolved === void 0) {
      throwExportsNotFound(packageSubpath, packageJsonUrl, base);
    }
    if (!pattern) {
      emitFolderMapDeprecation(bestMatch, packageJsonUrl, true, base);
    }
    return { resolved, exact: pattern };
  }
  throwExportsNotFound(packageSubpath, packageJsonUrl, base);
}
function packageImportsResolve(name, base, conditions) {
  if (name === "#" || name.startsWith("#/")) {
    const reason = "is not a valid internal imports specifier name";
    throw new ERR_INVALID_MODULE_SPECIFIER(name, reason, url.fileURLToPath(base));
  }
  let packageJsonUrl;
  const packageConfig = getPackageScopeConfig(base);
  if (packageConfig.exists) {
    packageJsonUrl = url.pathToFileURL(packageConfig.pjsonPath);
    const imports = packageConfig.imports;
    if (imports) {
      if (own.call(imports, name)) {
        const resolved = resolvePackageTarget(packageJsonUrl, imports[name], "", name, base, false, true, conditions);
        if (resolved !== null) {
          return { resolved, exact: true };
        }
      } else {
        let bestMatch = "";
        const keys = Object.getOwnPropertyNames(imports);
        let i = -1;
        while (++i < keys.length) {
          const key = keys[i];
          if (key[key.length - 1] === "*" && name.startsWith(key.slice(0, -1)) && name.length >= key.length && key.length > bestMatch.length) {
            bestMatch = key;
          } else if (key[key.length - 1] === "/" && name.startsWith(key) && key.length > bestMatch.length) {
            bestMatch = key;
          }
        }
        if (bestMatch) {
          const target = imports[bestMatch];
          const pattern = bestMatch[bestMatch.length - 1] === "*";
          const subpath = name.slice(bestMatch.length - (pattern ? 1 : 0));
          const resolved = resolvePackageTarget(packageJsonUrl, target, subpath, bestMatch, base, pattern, true, conditions);
          if (resolved !== null) {
            if (!pattern) {
              emitFolderMapDeprecation(bestMatch, packageJsonUrl, false, base);
            }
            return { resolved, exact: pattern };
          }
        }
      }
    }
  }
  throwImportNotDefined(name, packageJsonUrl, base);
}
function getPackageType(url) {
  const packageConfig = getPackageScopeConfig(url);
  return packageConfig.type;
}
function parsePackageName(specifier, base) {
  let separatorIndex = specifier.indexOf("/");
  let validPackageName = true;
  let isScoped = false;
  if (specifier[0] === "@") {
    isScoped = true;
    if (separatorIndex === -1 || specifier.length === 0) {
      validPackageName = false;
    } else {
      separatorIndex = specifier.indexOf("/", separatorIndex + 1);
    }
  }
  const packageName = separatorIndex === -1 ? specifier : specifier.slice(0, separatorIndex);
  let i = -1;
  while (++i < packageName.length) {
    if (packageName[i] === "%" || packageName[i] === "\\") {
      validPackageName = false;
      break;
    }
  }
  if (!validPackageName) {
    throw new ERR_INVALID_MODULE_SPECIFIER(specifier, "is not a valid package name", url.fileURLToPath(base));
  }
  const packageSubpath = "." + (separatorIndex === -1 ? "" : specifier.slice(separatorIndex));
  return { packageName, packageSubpath, isScoped };
}
function packageResolve(specifier, base, conditions) {
  const { packageName, packageSubpath, isScoped } = parsePackageName(specifier, base);
  const packageConfig = getPackageScopeConfig(base);
  if (packageConfig.exists) {
    const packageJsonUrl2 = url.pathToFileURL(packageConfig.pjsonPath);
    if (packageConfig.name === packageName && packageConfig.exports !== void 0 && packageConfig.exports !== null) {
      return packageExportsResolve(packageJsonUrl2, packageSubpath, packageConfig, base, conditions).resolved;
    }
  }
  let packageJsonUrl = new URL("./node_modules/" + packageName + "/package.json", base);
  let packageJsonPath = url.fileURLToPath(packageJsonUrl);
  let lastPath;
  do {
    const stat = tryStatSync(packageJsonPath.slice(0, -13));
    if (!stat.isDirectory()) {
      lastPath = packageJsonPath;
      packageJsonUrl = new URL((isScoped ? "../../../../node_modules/" : "../../../node_modules/") + packageName + "/package.json", packageJsonUrl);
      packageJsonPath = url.fileURLToPath(packageJsonUrl);
      continue;
    }
    const packageConfig2 = getPackageConfig(packageJsonPath, specifier, base);
    if (packageConfig2.exports !== void 0 && packageConfig2.exports !== null) {
      return packageExportsResolve(packageJsonUrl, packageSubpath, packageConfig2, base, conditions).resolved;
    }
    if (packageSubpath === ".") {
      return legacyMainResolve(packageJsonUrl, packageConfig2, base);
    }
    return new URL(packageSubpath, packageJsonUrl);
  } while (packageJsonPath.length !== lastPath.length);
  throw new ERR_MODULE_NOT_FOUND(packageName, url.fileURLToPath(base));
}
function isRelativeSpecifier(specifier) {
  if (specifier[0] === ".") {
    if (specifier.length === 1 || specifier[1] === "/") {
      return true;
    }
    if (specifier[1] === "." && (specifier.length === 2 || specifier[2] === "/")) {
      return true;
    }
  }
  return false;
}
function shouldBeTreatedAsRelativeOrAbsolutePath(specifier) {
  if (specifier === "") {
    return false;
  }
  if (specifier[0] === "/") {
    return true;
  }
  return isRelativeSpecifier(specifier);
}
function moduleResolve(specifier, base, conditions) {
  let resolved;
  if (shouldBeTreatedAsRelativeOrAbsolutePath(specifier)) {
    resolved = new URL(specifier, base);
  } else if (specifier[0] === "#") {
    ({ resolved } = packageImportsResolve(specifier, base, conditions));
  } else {
    try {
      resolved = new URL(specifier);
    } catch {
      resolved = packageResolve(specifier, base, conditions);
    }
  }
  return finalizeResolution(resolved, base);
}

const DEFAULT_CONDITIONS_SET = /* @__PURE__ */ new Set(["node", "import"]);
const DEFAULT_URL = url.pathToFileURL(process.cwd());
const DEFAULT_EXTENSIONS = [".mjs", ".cjs", ".js", ".json"];
const NOT_FOUND_ERRORS = /* @__PURE__ */ new Set(["ERR_MODULE_NOT_FOUND", "ERR_UNSUPPORTED_DIR_IMPORT", "MODULE_NOT_FOUND"]);
function _tryModuleResolve(id, url, conditions) {
  try {
    return moduleResolve(id, url, conditions);
  } catch (err) {
    if (!NOT_FOUND_ERRORS.has(err.code)) {
      throw err;
    }
    return null;
  }
}
function _resolve(id, opts = {}) {
  if (/(node|data|http|https):/.test(id)) {
    return id;
  }
  if (BUILTIN_MODULES.has(id)) {
    return "node:" + id;
  }
  if (pathe.isAbsolute(id) && fs.existsSync(id)) {
    const realPath2 = fs.realpathSync(fileURLToPath(id));
    return url.pathToFileURL(realPath2).toString();
  }
  const conditionsSet = opts.conditions ? new Set(opts.conditions) : DEFAULT_CONDITIONS_SET;
  const _urls = (Array.isArray(opts.url) ? opts.url : [opts.url]).filter(Boolean).map((u) => new URL(normalizeid(u.toString())));
  if (!_urls.length) {
    _urls.push(DEFAULT_URL);
  }
  const urls = [..._urls];
  for (const url of _urls) {
    if (url.protocol === "file:" && !url.pathname.includes("node_modules")) {
      const newURL = new URL(url);
      newURL.pathname += "/node_modules";
      urls.push(newURL);
    }
  }
  let resolved;
  for (const url of urls) {
    resolved = _tryModuleResolve(id, url, conditionsSet);
    if (resolved) {
      break;
    }
    for (const prefix of ["", "/index"]) {
      for (const ext of opts.extensions || DEFAULT_EXTENSIONS) {
        resolved = _tryModuleResolve(id + prefix + ext, url, conditionsSet);
        if (resolved) {
          break;
        }
      }
      if (resolved) {
        break;
      }
    }
  }
  if (!resolved) {
    const err = new Error(`Cannot find module ${id} imported from ${urls.join(", ")}`);
    err.code = "ERR_MODULE_NOT_FOUND";
    throw err;
  }
  const realPath = fs.realpathSync(fileURLToPath(resolved));
  return url.pathToFileURL(realPath).toString();
}
function resolveSync(id, opts) {
  return _resolve(id, opts);
}
function resolve(id, opts) {
  return pcall(resolveSync, id, opts);
}
function resolvePathSync(id, opts) {
  return fileURLToPath(resolveSync(id, opts));
}
function resolvePath(id, opts) {
  return pcall(resolvePathSync, id, opts);
}
function createResolve(defaults) {
  return (id, url) => {
    return resolve(id, { url, ...defaults });
  };
}

const EVAL_ESM_IMPORT_RE = /(?<=import .* from ['"])([^'"]+)(?=['"])|(?<=export .* from ['"])([^'"]+)(?=['"])|(?<=import\s*['"])([^'"]+)(?=['"])|(?<=import\s*\(['"])([^'"]+)(?=['"]\))/g;
async function loadModule(id, opts = {}) {
  const url = await resolve(id, opts);
  const code = await loadURL(url);
  return evalModule(code, { ...opts, url });
}
async function evalModule(code, opts = {}) {
  const transformed = await transformModule(code, opts);
  const dataURL = toDataURL(transformed);
  return import(dataURL).catch((err) => {
    err.stack = err.stack.replace(new RegExp(dataURL, "g"), opts.url || "_mlly_eval_");
    throw err;
  });
}
function transformModule(code, opts) {
  if (opts.url && opts.url.endsWith(".json")) {
    return Promise.resolve("export default " + code);
  }
  if (opts.url) {
    code = code.replace(/import\.meta\.url/g, `'${opts.url}'`);
  }
  return Promise.resolve(code);
}
async function resolveImports(code, opts) {
  const imports = Array.from(code.matchAll(EVAL_ESM_IMPORT_RE)).map((m) => m[0]);
  if (!imports.length) {
    return code;
  }
  const uniqueImports = Array.from(new Set(imports));
  const resolved = /* @__PURE__ */ new Map();
  await Promise.all(uniqueImports.map(async (id) => {
    let url = await resolve(id, opts);
    if (url.endsWith(".json")) {
      const code2 = await loadURL(url);
      url = toDataURL(await transformModule(code2, { url }));
    }
    resolved.set(id, url);
  }));
  const re = new RegExp(uniqueImports.map((i) => `(${i})`).join("|"), "g");
  return code.replace(re, (id) => resolved.get(id));
}

const ESM_RE = /([\s;]|^)(import[\w,{}\s*]*from|import\s*['"*{]|export\b\s*(?:[*{]|default|type|function|const|var|let|async function)|import\.meta\b)/m;
const BUILTIN_EXTENSIONS = /* @__PURE__ */ new Set([".mjs", ".cjs", ".node", ".wasm"]);
function hasESMSyntax(code) {
  return ESM_RE.test(code);
}
const CJS_RE = /([\s;]|^)(module.exports\b|exports\.\w|require\s*\(|global\.\w)/m;
function hasCJSSyntax(code) {
  return CJS_RE.test(code);
}
function detectSyntax(code) {
  const hasESM = hasESMSyntax(code);
  const hasCJS = hasCJSSyntax(code);
  return {
    hasESM,
    hasCJS,
    isMixed: hasESM && hasCJS
  };
}
const validNodeImportDefaults = {
  allowedProtocols: ["node", "file", "data"]
};
async function isValidNodeImport(id, _opts = {}) {
  if (isNodeBuiltin(id)) {
    return true;
  }
  const opts = { ...validNodeImportDefaults, ..._opts };
  const proto = getProtocol(id);
  if (proto && !opts.allowedProtocols.includes(proto)) {
    return false;
  }
  if (proto === "data") {
    return true;
  }
  const resolvedPath = await resolvePath(id, opts);
  const extension = pathe.extname(resolvedPath);
  if (BUILTIN_EXTENSIONS.has(extension)) {
    return true;
  }
  if (extension !== ".js") {
    return false;
  }
  if (resolvedPath.match(/\.(\w+-)?esm?(-\w+)?\.js$/)) {
    return false;
  }
  const pkg = await pkgTypes.readPackageJSON(resolvedPath).catch(() => null);
  if (pkg?.type === "module") {
    return true;
  }
  const code = opts.code || await fs.promises.readFile(resolvedPath, "utf-8").catch(() => null) || "";
  return hasCJSSyntax(code) || !hasESMSyntax(code);
}

exports.DYNAMIC_IMPORT_RE = DYNAMIC_IMPORT_RE;
exports.ESM_STATIC_IMPORT_RE = ESM_STATIC_IMPORT_RE;
exports.EXPORT_DECAL_RE = EXPORT_DECAL_RE;
exports.createCommonJS = createCommonJS;
exports.createResolve = createResolve;
exports.detectSyntax = detectSyntax;
exports.evalModule = evalModule;
exports.fileURLToPath = fileURLToPath;
exports.findDynamicImports = findDynamicImports;
exports.findExports = findExports;
exports.findStaticImports = findStaticImports;
exports.getProtocol = getProtocol;
exports.hasCJSSyntax = hasCJSSyntax;
exports.hasESMSyntax = hasESMSyntax;
exports.interopDefault = interopDefault;
exports.isNodeBuiltin = isNodeBuiltin;
exports.isValidNodeImport = isValidNodeImport;
exports.loadModule = loadModule;
exports.loadURL = loadURL;
exports.normalizeid = normalizeid;
exports.parseStaticImport = parseStaticImport;
exports.resolve = resolve;
exports.resolveImports = resolveImports;
exports.resolvePath = resolvePath;
exports.resolvePathSync = resolvePathSync;
exports.resolveSync = resolveSync;
exports.sanitizeFilePath = sanitizeFilePath;
exports.sanitizeURIComponent = sanitizeURIComponent;
exports.toDataURL = toDataURL;
exports.transformModule = transformModule;
