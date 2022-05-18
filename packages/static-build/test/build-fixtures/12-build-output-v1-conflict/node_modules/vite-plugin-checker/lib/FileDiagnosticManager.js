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
var FileDiagnosticManager_exports = {};
__export(FileDiagnosticManager_exports, {
  FileDiagnosticManager: () => FileDiagnosticManager
});
module.exports = __toCommonJS(FileDiagnosticManager_exports);
class FileDiagnosticManager {
  constructor() {
    this.diagnostics = [];
    this.initialized = false;
  }
  initWith(diagnostics) {
    if (this.initialized) {
      throw new Error("FileDiagnosticManager is already initialized");
    }
    diagnostics.forEach((d) => {
      this.diagnostics.push(d);
    });
    this.initialized = true;
  }
  getDiagnostics(fileName) {
    if (fileName) {
      return this.diagnostics.filter((f) => f.id === fileName);
    }
    return this.diagnostics;
  }
  updateByFileId(fileId, next) {
    for (let i = 0; i < this.diagnostics.length; i++) {
      if (this.diagnostics[i].id === fileId) {
        this.diagnostics.splice(i, 1);
        i--;
      }
    }
    if (next == null ? void 0 : next.length) {
      this.diagnostics.push(...next);
    }
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  FileDiagnosticManager
});
//# sourceMappingURL=FileDiagnosticManager.js.map