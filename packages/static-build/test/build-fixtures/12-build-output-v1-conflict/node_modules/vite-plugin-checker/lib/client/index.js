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
var client_exports = {};
__export(client_exports, {
  RUNTIME_FILE_PATH: () => RUNTIME_FILE_PATH,
  RUNTIME_PUBLIC_PATH: () => RUNTIME_PUBLIC_PATH,
  WS_CHECKER_CONFIG_RUNTIME_EVENT: () => WS_CHECKER_CONFIG_RUNTIME_EVENT,
  WS_CHECKER_ERROR_EVENT: () => WS_CHECKER_ERROR_EVENT,
  WS_CHECKER_RECONNECT_EVENT: () => WS_CHECKER_RECONNECT_EVENT,
  runtimeCode: () => runtimeCode
});
module.exports = __toCommonJS(client_exports);
var import_fs = __toESM(require("fs"));
const RUNTIME_PUBLIC_PATH = "/@vite-plugin-checker-runtime";
const RUNTIME_FILE_PATH = require.resolve("../@runtime/main.js");
const WS_CHECKER_ERROR_EVENT = "vite-plugin-checker:error";
const WS_CHECKER_RECONNECT_EVENT = "vite-plugin-checker:reconnect";
const WS_CHECKER_CONFIG_RUNTIME_EVENT = "vite-plugin-checker:config-runtime";
const runtimeCode = `${import_fs.default.readFileSync(RUNTIME_FILE_PATH, "utf-8")};`;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  RUNTIME_FILE_PATH,
  RUNTIME_PUBLIC_PATH,
  WS_CHECKER_CONFIG_RUNTIME_EVENT,
  WS_CHECKER_ERROR_EVENT,
  WS_CHECKER_RECONNECT_EVENT,
  runtimeCode
});
//# sourceMappingURL=index.js.map