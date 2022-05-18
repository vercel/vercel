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
export {
  transform as default
};
