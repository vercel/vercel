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

// src/webpack/loaders/transform.ts
var transform_exports = {};
__export(transform_exports, {
  default: () => transform
});
module.exports = __toCommonJS(transform_exports);

// src/webpack/genContext.ts
var import_path = require("path");
var import_webpack_sources = __toESM(require("webpack-sources"));
function genContext(compilation) {
  return {
    addWatchFile(id) {
      var _a;
      ((_a = compilation.fileDependencies) != null ? _a : compilation.compilationDependencies).add((0, import_path.resolve)(process.cwd(), id));
    },
    emitFile(emittedFile) {
      const outFileName = emittedFile.fileName || emittedFile.name;
      if (emittedFile.source && outFileName) {
        compilation.emitAsset(outFileName, import_webpack_sources.default ? new import_webpack_sources.default.RawSource(typeof emittedFile.source === "string" ? emittedFile.source : Buffer.from(emittedFile.source)) : {
          source: () => emittedFile.source,
          size: () => emittedFile.source.length
        });
      }
    },
    getWatchFiles() {
      var _a;
      return Array.from((_a = compilation.fileDependencies) != null ? _a : compilation.compilationDependencies);
    }
  };
}

// src/webpack/loaders/transform.ts
async function transform(source, map) {
  var _a;
  const callback = this.async();
  const { unpluginName } = this.query;
  const plugin = (_a = this._compiler) == null ? void 0 : _a.$unpluginContext[unpluginName];
  if (!(plugin == null ? void 0 : plugin.transform)) {
    return callback(null, source, map);
  }
  const context = {
    error: (error) => this.emitError(typeof error === "string" ? new Error(error) : error),
    warn: (error) => this.emitWarning(typeof error === "string" ? new Error(error) : error)
  };
  const res = await plugin.transform.call(Object.assign(this._compilation && genContext(this._compilation), context), source, this.resource);
  if (res == null) {
    callback(null, source, map);
  } else if (typeof res !== "string") {
    callback(null, res.code, map == null ? map : res.map || map);
  } else {
    callback(null, res, map);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {});
