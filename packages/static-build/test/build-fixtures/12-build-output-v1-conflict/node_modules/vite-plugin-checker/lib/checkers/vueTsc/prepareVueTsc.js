var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target, mod));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var prepareVueTsc_exports = {};
__export(prepareVueTsc_exports, {
  prepareVueTsc: () => prepareVueTsc
});
module.exports = __toCommonJS(prepareVueTsc_exports);
var import_fs = __toESM(require("fs"));
var import_path = __toESM(require("path"));
const proxyPath = require.resolve("vue-tsc/out/proxy");
const textToReplace = [
  {
    target: `ts.supportedTSExtensions = [[".ts", ".tsx", ".d.ts"], [".cts", ".d.cts"], [".mts", ".d.mts"]];`,
    replacement: `ts.supportedTSExtensions = [[".ts", ".tsx", ".d.ts"], [".cts", ".d.cts"], [".mts", ".d.mts"], [".vue"]];`
  },
  {
    target: `ts.supportedJSExtensions = [[".js", ".jsx"], [".mjs"], [".cjs"]];`,
    replacement: `ts.supportedJSExtensions = [[".js", ".jsx"], [".mjs"], [".cjs"], [".vue"]];`
  },
  {
    target: `var allSupportedExtensions = [[".ts", ".tsx", ".d.ts", ".js", ".jsx"], [".cts", ".d.cts", ".cjs"], [".mts", ".d.mts", ".mjs"]];`,
    replacement: `var allSupportedExtensions = [[".ts", ".tsx", ".d.ts", ".js", ".jsx"], [".cts", ".d.cts", ".cjs"], [".mts", ".d.mts", ".mjs"], [".vue"]];`
  },
  {
    target: `function createIncrementalProgram(_a) {`,
    replacement: `function createIncrementalProgram(_a) { console.error('incremental mode is not yet supported'); throw 'incremental mode is not yet supported';`
  },
  {
    target: `function createProgram(rootNamesOrOptions, _options, _host, _oldProgram, _configFileParsingDiagnostics) {`,
    replacement: `function createProgram(rootNamesOrOptions, _options, _host, _oldProgram, _configFileParsingDiagnostics) { return require(${JSON.stringify(proxyPath)}).createProgramProxy(...arguments);`
  },
  {
    target: `ts.executeCommandLine(ts.sys, ts.noop, ts.sys.args);`,
    replacement: `module.exports = ts`
  }
];
function prepareVueTsc() {
  const targetTsDir = import_path.default.resolve(__dirname, "typescript-vue-tsc");
  const vueTscFlagFile = import_path.default.resolve(targetTsDir, "vue-tsc-resolve-path");
  let shouldPrepare = true;
  const targetDirExist = import_fs.default.existsSync(targetTsDir);
  if (targetDirExist) {
    const targetTsVersion = require(import_path.default.resolve(targetTsDir, "package.json")).version;
    const currTsVersion = require("typescript/package.json").version;
    if (targetTsVersion === currTsVersion && import_fs.default.existsSync(vueTscFlagFile) && import_fs.default.readFileSync(vueTscFlagFile, "utf8") === proxyPath) {
      shouldPrepare = true;
    }
  }
  if (shouldPrepare) {
    rimraf(targetTsDir);
    import_fs.default.mkdirSync(targetTsDir);
    const sourceTsDir = import_path.default.resolve(require.resolve("typescript"), "../..");
    copyDirRecursively(sourceTsDir, targetTsDir);
    import_fs.default.writeFileSync(vueTscFlagFile, proxyPath);
    const tscJs = require.resolve(import_path.default.resolve(targetTsDir, "lib/tsc.js"));
    modifyFileText(tscJs, textToReplace);
  }
  return { targetTsDir };
}
function modifyFileText(filePath, textToReplace2) {
  const text = import_fs.default.readFileSync(filePath, "utf8");
  let newText = text;
  for (const { target, replacement } of textToReplace2) {
    newText = newText.replace(target, replacement);
  }
  import_fs.default.writeFileSync(filePath, newText);
}
function copyDirRecursively(src, dest) {
  const files = import_fs.default.readdirSync(src, { withFileTypes: true });
  for (const file of files) {
    const srcPath = import_path.default.join(src, file.name);
    const destPath = import_path.default.join(dest, file.name);
    if (file.isDirectory()) {
      import_fs.default.mkdirSync(destPath, { recursive: true });
      copyDirRecursively(srcPath, destPath);
    } else {
      import_fs.default.copyFileSync(srcPath, destPath);
    }
  }
}
function rimraf(dir_path) {
  if (import_fs.default.existsSync(dir_path)) {
    import_fs.default.readdirSync(dir_path).forEach((entry) => {
      const entry_path = import_path.default.join(dir_path, entry);
      if (import_fs.default.lstatSync(entry_path).isDirectory()) {
        rimraf(entry_path);
      } else {
        import_fs.default.unlinkSync(entry_path);
      }
    });
    import_fs.default.rmdirSync(dir_path);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  prepareVueTsc
});
//# sourceMappingURL=prepareVueTsc.js.map