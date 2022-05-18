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
var main_exports = {};
__export(main_exports, {
  VlsChecker: () => VlsChecker,
  createDiagnostic: () => createDiagnostic
});
module.exports = __toCommonJS(main_exports);
var import_os = __toESM(require("os"));
var import_worker_threads = require("worker_threads");
var import_Checker = require("../../Checker");
var import_logger = require("../../logger");
var import_types = require("../../types");
var import_diagnostics = require("./diagnostics");
const createDiagnostic = (pluginConfig) => {
  let overlay = true;
  let terminal = true;
  let command;
  return {
    config: ({ enableOverlay, enableTerminal, env }) => {
      overlay = enableOverlay;
      terminal = enableTerminal;
      command = env.command;
    },
    async configureServer({ root }) {
      const workDir = root;
      const onDispatchDiagnosticsSummary = (errorCount, warningCount) => {
        if (!terminal)
          return;
        (0, import_logger.consoleLog)((0, import_logger.composeCheckerSummary)("VLS", errorCount, warningCount));
      };
      const onDispatchDiagnostics = (normalized) => {
        var _a;
        if (overlay && command === "serve") {
          (_a = import_worker_threads.parentPort) == null ? void 0 : _a.postMessage({
            type: import_types.ACTION_TYPES.overlayError,
            payload: (0, import_logger.toViteCustomPayload)("vls", (0, import_logger.diagnosticToRuntimeError)(normalized))
          });
        }
        if (terminal) {
          (0, import_logger.consoleLog)(normalized.map((d) => (0, import_logger.diagnosticToTerminalLog)(d, "VLS")).join(import_os.default.EOL));
        }
      };
      const vlsConfig = pluginConfig == null ? void 0 : pluginConfig.vls;
      await (0, import_diagnostics.diagnostics)(workDir, "WARN", {
        onDispatchDiagnostics,
        onDispatchDiagnosticsSummary,
        watch: true,
        verbose: false,
        config: typeof vlsConfig === "object" ? vlsConfig : null
      });
    }
  };
};
class VlsChecker extends import_Checker.Checker {
  constructor() {
    super({
      name: "vls",
      absFilePath: __filename,
      build: {
        buildBin: (config) => {
          if (typeof config.vls === "object") {
            return [
              "vite-plugin-checker-vls",
              [
                "diagnostics",
                "--checker-config",
                '"' + JSON.stringify(config.vls).replace(/[\\"]/g, "\\$&") + '"'
              ]
            ];
          }
          return ["vite-plugin-checker-vls", ["diagnostics"]];
        }
      },
      createDiagnostic
    });
  }
  init() {
    const createServeAndBuild = super.initMainThread();
    module.exports.createServeAndBuild = createServeAndBuild;
    super.initWorkerThread();
  }
}
const vlsChecker = new VlsChecker();
vlsChecker.prepare();
vlsChecker.init();
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  VlsChecker,
  createDiagnostic
});
//# sourceMappingURL=main.js.map