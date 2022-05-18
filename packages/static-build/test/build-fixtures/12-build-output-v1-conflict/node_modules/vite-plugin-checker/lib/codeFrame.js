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
var codeFrame_exports = {};
__export(codeFrame_exports, {
  createFrame: () => createFrame,
  tsLocationToBabelLocation: () => tsLocationToBabelLocation
});
module.exports = __toCommonJS(codeFrame_exports);
var import_os = __toESM(require("os"));
var import_code_frame = require("@babel/code-frame");
function createFrame({
  source,
  location
}) {
  const frame = (0, import_code_frame.codeFrameColumns)(source, location, {
    highlightCode: true
  }).split("\n").map((line) => "  " + line).join(import_os.default.EOL);
  return frame;
}
function tsLocationToBabelLocation(tsLoc) {
  return {
    start: { line: tsLoc.start.line + 1, column: tsLoc.start.character + 1 },
    end: { line: tsLoc.end.line + 1, column: tsLoc.end.character + 1 }
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createFrame,
  tsLocationToBabelLocation
});
//# sourceMappingURL=codeFrame.js.map