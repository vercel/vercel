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
var types_exports = {};
__export(types_exports, {
  ACTION_TYPES: () => ACTION_TYPES,
  DiagnosticLevel: () => DiagnosticLevel
});
module.exports = __toCommonJS(types_exports);
var DiagnosticLevel = /* @__PURE__ */ ((DiagnosticLevel2) => {
  DiagnosticLevel2[DiagnosticLevel2["Warning"] = 0] = "Warning";
  DiagnosticLevel2[DiagnosticLevel2["Error"] = 1] = "Error";
  DiagnosticLevel2[DiagnosticLevel2["Suggestion"] = 2] = "Suggestion";
  DiagnosticLevel2[DiagnosticLevel2["Message"] = 3] = "Message";
  return DiagnosticLevel2;
})(DiagnosticLevel || {});
var ACTION_TYPES = /* @__PURE__ */ ((ACTION_TYPES2) => {
  ACTION_TYPES2["config"] = "config";
  ACTION_TYPES2["configureServer"] = "configureServer";
  ACTION_TYPES2["overlayError"] = "overlayError";
  ACTION_TYPES2["console"] = "console";
  ACTION_TYPES2["unref"] = "unref";
  return ACTION_TYPES2;
})(ACTION_TYPES || {});
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  ACTION_TYPES,
  DiagnosticLevel
});
//# sourceMappingURL=types.js.map