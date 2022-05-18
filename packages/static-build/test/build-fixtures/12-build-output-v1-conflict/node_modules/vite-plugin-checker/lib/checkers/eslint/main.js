var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getOwnPropSymbols = Object.getOwnPropertySymbols;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __propIsEnum = Object.prototype.propertyIsEnumerable;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __spreadValues = (a, b) => {
  for (var prop in b || (b = {}))
    if (__hasOwnProp.call(b, prop))
      __defNormalProp(a, prop, b[prop]);
  if (__getOwnPropSymbols)
    for (var prop of __getOwnPropSymbols(b)) {
      if (__propIsEnum.call(b, prop))
        __defNormalProp(a, prop, b[prop]);
    }
  return a;
};
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
  EslintChecker: () => EslintChecker
});
module.exports = __toCommonJS(main_exports);
var import_chokidar = __toESM(require("chokidar"));
var import_eslint = require("eslint");
var import_options = __toESM(require("./options"));
var import_path = __toESM(require("path"));
var import_worker_threads = require("worker_threads");
var import_Checker = require("../../Checker");
var import_FileDiagnosticManager = require("../../FileDiagnosticManager");
var import_logger = require("../../logger");
var import_types = require("../../types");
var import_cli = require("./cli");
const manager = new import_FileDiagnosticManager.FileDiagnosticManager();
const createDiagnostic = (pluginConfig) => {
  let overlay = true;
  let terminal = true;
  return {
    config: async ({ enableOverlay, enableTerminal }) => {
      overlay = enableOverlay;
      terminal = enableTerminal;
    },
    async configureServer({ root }) {
      var _a;
      if (!pluginConfig.eslint)
        return;
      const options = import_options.default.parse(pluginConfig.eslint.lintCommand);
      const translatedOptions = (0, import_cli.translateOptions)(options);
      const logLevel = (() => {
        var _a2;
        if (typeof pluginConfig.eslint !== "object")
          return void 0;
        const userLogLevel = (_a2 = pluginConfig.eslint.dev) == null ? void 0 : _a2.logLevel;
        if (!userLogLevel)
          return void 0;
        const map = {
          error: import_types.DiagnosticLevel.Error,
          warning: import_types.DiagnosticLevel.Warning
        };
        return userLogLevel.map((l) => map[l]);
      })();
      const eslint = new import_eslint.ESLint(__spreadValues(__spreadValues({
        cwd: root
      }, translatedOptions), (_a = pluginConfig.eslint.dev) == null ? void 0 : _a.overrideConfig));
      const dispatchDiagnostics = () => {
        var _a2;
        const diagnostics2 = (0, import_logger.filterLogLevel)(manager.getDiagnostics(), logLevel);
        if (terminal) {
          diagnostics2.forEach((d) => {
            (0, import_logger.consoleLog)((0, import_logger.diagnosticToTerminalLog)(d, "ESLint"));
          });
          const errorCount = diagnostics2.filter((d) => d.level === import_types.DiagnosticLevel.Error).length;
          const warningCount = diagnostics2.filter((d) => d.level === import_types.DiagnosticLevel.Warning).length;
          (0, import_logger.consoleLog)((0, import_logger.composeCheckerSummary)("ESLint", errorCount, warningCount));
        }
        if (overlay) {
          (_a2 = import_worker_threads.parentPort) == null ? void 0 : _a2.postMessage({
            type: import_types.ACTION_TYPES.overlayError,
            payload: (0, import_logger.toViteCustomPayload)("eslint", diagnostics2.map((d) => (0, import_logger.diagnosticToRuntimeError)(d)))
          });
        }
      };
      const handleFileChange = async (filePath, type) => {
        const absPath = import_path.default.resolve(root, filePath);
        if (type === "unlink") {
          manager.updateByFileId(absPath, []);
        } else if (type === "change") {
          const diagnosticsOfChangedFile = await eslint.lintFiles(filePath);
          const newDiagnostics = diagnosticsOfChangedFile.map((d) => (0, import_logger.normalizeEslintDiagnostic)(d)).flat(1);
          manager.updateByFileId(absPath, newDiagnostics);
        }
        dispatchDiagnostics();
      };
      const files = options._.slice(1);
      const diagnostics = await eslint.lintFiles(files);
      manager.initWith(diagnostics.map((p) => (0, import_logger.normalizeEslintDiagnostic)(p)).flat(1));
      dispatchDiagnostics();
      const watcher = import_chokidar.default.watch([], {
        cwd: root,
        ignored: (path2) => path2.includes("node_modules")
      });
      watcher.add(files);
      watcher.on("change", async (filePath) => {
        handleFileChange(filePath, "change");
      });
      watcher.on("unlink", async (filePath) => {
        handleFileChange(filePath, "unlink");
      });
    }
  };
};
class EslintChecker extends import_Checker.Checker {
  constructor() {
    super({
      name: "eslint",
      absFilePath: __filename,
      build: {
        buildBin: (pluginConfig) => {
          if (pluginConfig.eslint) {
            const { lintCommand } = pluginConfig.eslint;
            return ["eslint", lintCommand.split(" ").slice(1)];
          }
          return ["eslint", [""]];
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
const eslintChecker = new EslintChecker();
eslintChecker.prepare();
eslintChecker.init();
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  EslintChecker
});
//# sourceMappingURL=main.js.map