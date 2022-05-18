var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var worker_exports = {};
__export(worker_exports, {
  createScript: () => createScript
});
module.exports = __toCommonJS(worker_exports);
var import_worker_threads = require("worker_threads");
var import_types = require("./types");
function createScript({
  absFilename,
  buildBin,
  serverChecker
}) {
  return {
    mainScript: () => {
      const createWorker = (checkerConfig, env) => {
        const isBuild = env.command === "build";
        const worker = new import_worker_threads.Worker(absFilename, {
          workerData: { env, checkerConfig }
        });
        return {
          worker,
          config: (config) => {
            if (isBuild)
              return;
            const configAction = { type: import_types.ACTION_TYPES.config, payload: config };
            worker.postMessage(configAction);
          },
          configureServer: (serverConfig) => {
            const configureServerAction = {
              type: import_types.ACTION_TYPES.configureServer,
              payload: serverConfig
            };
            worker.postMessage(configureServerAction);
          }
        };
      };
      return (config, env) => ({
        serve: createWorker(config, env),
        build: { buildBin }
      });
    },
    workerScript: () => {
      let diagnostic = null;
      if (!import_worker_threads.parentPort)
        throw Error("should have parentPort as file runs in worker thread");
      const isBuild = import_worker_threads.workerData.env.command === "build";
      const port = import_worker_threads.parentPort.on("message", (action) => {
        switch (action.type) {
          case import_types.ACTION_TYPES.config: {
            const checkerConfig = import_worker_threads.workerData.checkerConfig;
            diagnostic = serverChecker.createDiagnostic(checkerConfig);
            diagnostic.config(action.payload);
            break;
          }
          case import_types.ACTION_TYPES.configureServer:
            if (!diagnostic)
              throw Error("diagnostic should be initialized in `config` hook of Vite");
            diagnostic.configureServer(action.payload);
            break;
          case import_types.ACTION_TYPES.unref:
            port.unref();
            break;
        }
      });
      if (isBuild) {
        port.unref();
      }
    }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createScript
});
//# sourceMappingURL=worker.js.map