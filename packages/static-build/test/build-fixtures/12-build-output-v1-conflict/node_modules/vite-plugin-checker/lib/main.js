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
  default: () => Plugin,
  isObject: () => isObject
});
module.exports = Plugin;
Plugin['default'] = Plugin;
var import_chalk = __toESM(require("chalk"));
var import_child_process = require("child_process");
var import_lodash = __toESM(require("lodash.pick"));
var import_npm_run_path = __toESM(require("npm-run-path"));
var import_path = __toESM(require("path"));
var import_Checker = require("./Checker");
var import_client = require("./client/index");
var import_types = require("./types");
const sharedConfigKeys = ["enableBuild", "overlay"];
const buildInCheckerKeys = ["typescript", "vueTsc", "vls", "eslint"];
function createCheckers(userConfig, env) {
  const serveAndBuildCheckers = [];
  const sharedConfig = (0, import_lodash.default)(userConfig, sharedConfigKeys);
  buildInCheckerKeys.forEach((name) => {
    if (!userConfig[name])
      return;
    const { createServeAndBuild } = require(`./checkers/${name}/main`);
    serveAndBuildCheckers.push(createServeAndBuild(__spreadValues({ [name]: userConfig[name] }, sharedConfig), env));
  });
  return serveAndBuildCheckers;
}
function Plugin(userConfig) {
  var _a;
  const enableBuild = (_a = userConfig == null ? void 0 : userConfig.enableBuild) != null ? _a : true;
  const enableOverlay = (userConfig == null ? void 0 : userConfig.overlay) !== false;
  const enableTerminal = (userConfig == null ? void 0 : userConfig.terminal) !== false;
  const overlayConfig = typeof (userConfig == null ? void 0 : userConfig.overlay) === "object" ? userConfig == null ? void 0 : userConfig.overlay : null;
  let resolvedRuntimePath = import_client.RUNTIME_PUBLIC_PATH;
  let checkers = [];
  let viteMode;
  let resolvedConfig;
  return {
    name: "vite-plugin-checker",
    config: (config, env) => {
      viteMode = env.command;
      checkers = createCheckers(userConfig || {}, env);
      if (viteMode !== "serve")
        return;
      checkers.forEach((checker) => {
        const workerConfig = checker.serve.config;
        workerConfig({
          enableOverlay,
          enableTerminal,
          env
        });
      });
    },
    configResolved(config) {
      resolvedConfig = config;
      resolvedRuntimePath = config.base + import_client.RUNTIME_PUBLIC_PATH.slice(1);
    },
    buildEnd() {
      if (viteMode === "serve") {
        checkers.forEach((checker) => {
          const { worker } = checker.serve;
          worker.terminate();
        });
      }
    },
    resolveId(id) {
      if (viteMode === "serve") {
        if (id === import_client.RUNTIME_PUBLIC_PATH) {
          return id;
        }
      }
    },
    load(id) {
      if (viteMode === "serve") {
        if (id === import_client.RUNTIME_PUBLIC_PATH) {
          return import_client.runtimeCode;
        }
      }
    },
    transform(code, id) {
      if (id === import_client.RUNTIME_PUBLIC_PATH) {
        if (!resolvedConfig)
          return;
        let options = resolvedConfig.server.hmr;
        options = options && typeof options !== "boolean" ? options : {};
        const host = options.host || null;
        const protocol = options.protocol || null;
        let port;
        if (isObject(resolvedConfig.server.hmr)) {
          port = resolvedConfig.server.hmr.clientPort || resolvedConfig.server.hmr.port;
        }
        if (resolvedConfig.server.middlewareMode) {
          port = String(port || 24678);
        } else {
          port = String(port || options.port || resolvedConfig.server.port);
        }
        let hmrBase = resolvedConfig.base;
        if (options.path) {
          hmrBase = import_path.default.posix.join(hmrBase, options.path);
        }
        if (hmrBase !== "/") {
          port = import_path.default.posix.normalize(`${port}${hmrBase}`);
        }
        return code.replace(/__HMR_PROTOCOL__/g, JSON.stringify(protocol)).replace(/__HMR_HOSTNAME__/g, JSON.stringify(host)).replace(/__HMR_PORT__/g, JSON.stringify(port));
      }
      return null;
    },
    transformIndexHtml() {
      if (viteMode === "serve") {
        return [
          {
            tag: "script",
            attrs: { type: "module" },
            children: `import { inject } from "${resolvedRuntimePath}"; inject();`
          }
        ];
      }
    },
    buildStart: () => {
      if (viteMode !== "build")
        return;
      if (!enableBuild)
        return;
      const localEnv = import_npm_run_path.default.env({
        env: process.env,
        cwd: process.cwd(),
        execPath: process.execPath
      });
      (async () => {
        var _a2;
        const exitCodes = await Promise.all(checkers.map((checker) => spawnChecker(checker, userConfig, localEnv)));
        const exitCode = (_a2 = exitCodes.find((code) => code !== 0)) != null ? _a2 : 0;
        if (exitCode !== 0)
          process.exit(exitCode);
      })();
    },
    configureServer(server) {
      let connectedTimes = 0;
      let latestOverlayErrors = new Array(checkers.length);
      if (overlayConfig) {
        server.ws.send({
          type: "custom",
          event: import_client.WS_CHECKER_CONFIG_RUNTIME_EVENT,
          data: overlayConfig
        });
      }
      checkers.forEach((checker, index) => {
        const { worker, configureServer: workerConfigureServer } = checker.serve;
        workerConfigureServer({ root: server.config.root });
        worker.on("message", (action) => {
          if (action.type === import_types.ACTION_TYPES.overlayError) {
            latestOverlayErrors[index] = action.payload;
            if (action.payload) {
              server.ws.send(action.payload);
            }
          } else if (action.type === import_types.ACTION_TYPES.console) {
            import_Checker.Checker.log(action);
          }
        });
      });
      return () => {
        if (server.ws.on) {
          server.ws.on("connection", () => {
            connectedTimes++;
            if (connectedTimes > 1) {
              if (overlayConfig) {
                server.ws.send({
                  type: "custom",
                  event: import_client.WS_CHECKER_CONFIG_RUNTIME_EVENT,
                  data: overlayConfig
                });
              }
              server.ws.send({
                type: "custom",
                event: import_client.WS_CHECKER_RECONNECT_EVENT,
                data: latestOverlayErrors.filter(Boolean)
              });
            }
          });
        } else {
          setTimeout(() => {
            console.warn(import_chalk.default.yellow("[vite-plugin-checker]: `server.ws.on` is introduced to Vite in 2.6.8, see [PR](https://github.com/vitejs/vite/pull/5273) and [changelog](https://github.com/vitejs/vite/blob/main/packages/vite/CHANGELOG.md#268-2021-10-18). \nvite-plugin-checker relies on `server.ws.on` to bring diagnostics back after a full reload and it' not available for you now due to the old version of Vite. You can upgrade Vite to latest version to eliminate this warning."));
          }, 5e3);
        }
        server.middlewares.use((req, res, next) => {
          next();
        });
      };
    }
  };
}
function spawnChecker(checker, userConfig, localEnv) {
  return new Promise((resolve) => {
    const buildBin = checker.build.buildBin;
    const finalBin = typeof buildBin === "function" ? buildBin(userConfig) : buildBin;
    const proc = (0, import_child_process.spawn)(...finalBin, {
      cwd: process.cwd(),
      stdio: "inherit",
      env: localEnv,
      shell: true
    });
    proc.on("exit", (code) => {
      if (code !== null && code !== 0) {
        resolve(code);
      } else {
        resolve(0);
      }
    });
  });
}
function isObject(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  isObject
});
//# sourceMappingURL=main.js.map