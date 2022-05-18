// src/webpack/genContext.ts
import { resolve } from "path";
import sources from "webpack-sources";
function genContext(compilation) {
  return {
    addWatchFile(id) {
      var _a;
      ((_a = compilation.fileDependencies) != null ? _a : compilation.compilationDependencies).add(resolve(process.cwd(), id));
    },
    emitFile(emittedFile) {
      const outFileName = emittedFile.fileName || emittedFile.name;
      if (emittedFile.source && outFileName) {
        compilation.emitAsset(outFileName, sources ? new sources.RawSource(typeof emittedFile.source === "string" ? emittedFile.source : Buffer.from(emittedFile.source)) : {
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

// src/webpack/utils.ts
function slash(path) {
  return path.replace(/\\/g, "/");
}

// src/webpack/loaders/load.ts
async function load(source, map) {
  var _a, _b;
  const callback = this.async();
  const { unpluginName } = this.query;
  const plugin = (_a = this._compiler) == null ? void 0 : _a.$unpluginContext[unpluginName];
  let id = this.resource;
  if (!(plugin == null ? void 0 : plugin.load) || !id) {
    return callback(null, source, map);
  }
  const context = {
    error: (error) => this.emitError(typeof error === "string" ? new Error(error) : error),
    warn: (error) => this.emitWarning(typeof error === "string" ? new Error(error) : error)
  };
  if (id.startsWith(plugin.__virtualModulePrefix)) {
    id = id.slice(plugin.__virtualModulePrefix.length);
  }
  const res = await plugin.load.call(Object.assign(this._compilation && genContext(this._compilation), context), slash(id));
  if (res == null) {
    callback(null, source, map);
  } else if (typeof res !== "string") {
    callback(null, res.code, (_b = res.map) != null ? _b : map);
  } else {
    callback(null, res, map);
  }
}
export {
  load as default
};
