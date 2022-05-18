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
var logger_exports = {};
__export(logger_exports, {
  composeCheckerSummary: () => composeCheckerSummary,
  consoleLog: () => consoleLog,
  createFrame: () => createFrame,
  diagnosticToRuntimeError: () => diagnosticToRuntimeError,
  diagnosticToTerminalLog: () => diagnosticToTerminalLog,
  ensureCall: () => ensureCall,
  filterLogLevel: () => filterLogLevel,
  lspRange2Location: () => lspRange2Location,
  normalizeEslintDiagnostic: () => normalizeEslintDiagnostic,
  normalizeLspDiagnostic: () => normalizeLspDiagnostic,
  normalizePublishDiagnosticParams: () => normalizePublishDiagnosticParams,
  normalizeTsDiagnostic: () => normalizeTsDiagnostic,
  normalizeVueTscDiagnostic: () => normalizeVueTscDiagnostic,
  toViteCustomPayload: () => toViteCustomPayload,
  tsLocationToBabelLocation: () => tsLocationToBabelLocation,
  uriToAbsPath: () => uriToAbsPath,
  wrapCheckerSummary: () => wrapCheckerSummary
});
module.exports = __toCommonJS(logger_exports);
var import_chalk = __toESM(require("chalk"));
var import_fs = __toESM(require("fs"));
var import_os = __toESM(require("os"));
var import_strip_ansi = __toESM(require("strip-ansi"));
var import_vscode_uri = require("vscode-uri");
var import_worker_threads = require("worker_threads");
var import_code_frame = require("@babel/code-frame");
var import_client = require("./client/index");
var import_types = require("./types");
const defaultLogLevel = [
  import_types.DiagnosticLevel.Warning,
  import_types.DiagnosticLevel.Error,
  import_types.DiagnosticLevel.Suggestion,
  import_types.DiagnosticLevel.Message
];
function filterLogLevel(diagnostics, level = defaultLogLevel) {
  if (Array.isArray(diagnostics)) {
    return diagnostics.filter((d) => {
      if (typeof d.level !== "number")
        return false;
      return level.includes(d.level);
    });
  } else {
    if (!diagnostics.level)
      return null;
    return level.includes(diagnostics.level) ? diagnostics : null;
  }
}
function diagnosticToTerminalLog(d, name) {
  var _a;
  const nameInLabel = name ? `(${name})` : "";
  const boldBlack = import_chalk.default.bold.rgb(0, 0, 0);
  const labelMap = {
    [import_types.DiagnosticLevel.Error]: boldBlack.bgRedBright(` ERROR${nameInLabel} `),
    [import_types.DiagnosticLevel.Warning]: boldBlack.bgYellowBright(` WARNING${nameInLabel} `),
    [import_types.DiagnosticLevel.Suggestion]: boldBlack.bgBlueBright(` SUGGESTION${nameInLabel} `),
    [import_types.DiagnosticLevel.Message]: boldBlack.bgCyanBright(` MESSAGE${nameInLabel} `)
  };
  const levelLabel = labelMap[(_a = d.level) != null ? _a : import_types.DiagnosticLevel.Error];
  const fileLabel = boldBlack.bgCyanBright(" FILE ") + " ";
  const position = d.loc ? import_chalk.default.yellow(d.loc.start.line) + ":" + import_chalk.default.yellow(d.loc.start.column) : "";
  return [
    levelLabel + " " + d.message,
    fileLabel + d.id + ":" + position + import_os.default.EOL,
    d.codeFrame + import_os.default.EOL,
    d.conclusion
  ].filter(Boolean).join(import_os.default.EOL);
}
function diagnosticToRuntimeError(diagnostics) {
  const diagnosticsArray = Array.isArray(diagnostics) ? diagnostics : [diagnostics];
  const results = diagnosticsArray.map((d) => {
    var _a;
    let loc;
    if (d.loc) {
      loc = {
        file: d.id,
        line: d.loc.start.line,
        column: typeof d.loc.start.column === "number" ? d.loc.start.column : 0
      };
    }
    return {
      message: (_a = d.message) != null ? _a : "",
      stack: typeof d.stack === "string" ? d.stack : Array.isArray(d.stack) ? d.stack.join(import_os.default.EOL) : "",
      id: d.id,
      frame: d.stripedCodeFrame,
      checkerId: d.checker,
      level: d.level,
      loc
    };
  });
  return Array.isArray(diagnostics) ? results : results[0];
}
function toViteCustomPayload(id, diagnostics) {
  return {
    type: "custom",
    event: import_client.WS_CHECKER_ERROR_EVENT,
    data: {
      checkerId: id,
      diagnostics
    }
  };
}
function createFrame({
  source,
  location
}) {
  const frame = (0, import_code_frame.codeFrameColumns)(source, location, {
    forceColor: true
  }).split("\n").map((line) => "  " + line).join(import_os.default.EOL);
  return frame;
}
function tsLocationToBabelLocation(tsLoc) {
  return {
    start: { line: tsLoc.start.line + 1, column: tsLoc.start.character + 1 },
    end: { line: tsLoc.end.line + 1, column: tsLoc.end.character + 1 }
  };
}
function wrapCheckerSummary(checkerName, rawSummary) {
  return `[${checkerName}] ${rawSummary}`;
}
function composeCheckerSummary(checkerName, errorCount, warningCount) {
  const message = `Found ${errorCount} error${errorCount > 1 ? "s" : ""} and ${warningCount} warning${warningCount > 1 ? "s" : ""}`;
  const hasError = errorCount > 0;
  const hasWarning = warningCount > 0;
  const color = hasError ? "red" : hasWarning ? "yellow" : "green";
  return import_chalk.default[color](wrapCheckerSummary(checkerName, message));
}
function normalizeTsDiagnostic(d) {
  var _a, _b, _c, _d;
  const fileName = (_a = d.file) == null ? void 0 : _a.fileName;
  const {
    flattenDiagnosticMessageText
  } = require("typescript");
  const message = flattenDiagnosticMessageText(d.messageText, import_os.default.EOL);
  let loc;
  const pos = d.start === void 0 ? null : (_b = d.file) == null ? void 0 : _b.getLineAndCharacterOfPosition(d.start);
  if (pos && d.file && typeof d.start === "number" && typeof d.length === "number") {
    loc = tsLocationToBabelLocation({
      start: (_c = d.file) == null ? void 0 : _c.getLineAndCharacterOfPosition(d.start),
      end: (_d = d.file) == null ? void 0 : _d.getLineAndCharacterOfPosition(d.start + d.length)
    });
  }
  let codeFrame;
  if (loc) {
    codeFrame = createFrame({
      source: d.file.text,
      location: loc
    });
  }
  return {
    message,
    conclusion: "",
    codeFrame,
    stripedCodeFrame: codeFrame && (0, import_strip_ansi.default)(codeFrame),
    id: fileName,
    checker: "TypeScript",
    loc,
    level: d.category
  };
}
function normalizeLspDiagnostic({
  diagnostic,
  absFilePath,
  fileText
}) {
  let level = import_types.DiagnosticLevel.Error;
  const loc = lspRange2Location(diagnostic.range);
  const codeFrame = (0, import_code_frame.codeFrameColumns)(fileText, loc);
  switch (diagnostic.severity) {
    case 1:
      level = import_types.DiagnosticLevel.Error;
      break;
    case 2:
      level = import_types.DiagnosticLevel.Warning;
      break;
    case 3:
      level = import_types.DiagnosticLevel.Message;
      break;
    case 4:
      level = import_types.DiagnosticLevel.Suggestion;
      break;
  }
  return {
    message: diagnostic.message.trim(),
    conclusion: "",
    codeFrame,
    stripedCodeFrame: codeFrame && (0, import_strip_ansi.default)(codeFrame),
    id: absFilePath,
    checker: "VLS",
    loc,
    level
  };
}
async function normalizePublishDiagnosticParams(publishDiagnostics) {
  const diagnostics = publishDiagnostics.diagnostics;
  const absFilePath = uriToAbsPath(publishDiagnostics.uri);
  const { readFile } = import_fs.default.promises;
  const fileText = await readFile(absFilePath, "utf-8");
  const res = diagnostics.map((d) => {
    return normalizeLspDiagnostic({
      diagnostic: d,
      absFilePath,
      fileText
    });
  });
  return res;
}
function uriToAbsPath(documentUri) {
  return import_vscode_uri.URI.parse(documentUri).fsPath;
}
function lspRange2Location(range) {
  return {
    start: {
      line: range.start.line + 1,
      column: range.start.character + 1
    },
    end: {
      line: range.end.line + 1,
      column: range.end.character + 1
    }
  };
}
function normalizeVueTscDiagnostic(d) {
  const diagnostic = normalizeTsDiagnostic(d);
  diagnostic.checker = "vue-tsc";
  return diagnostic;
}
const isNormalizedDiagnostic = (d) => {
  return Boolean(d);
};
function normalizeEslintDiagnostic(diagnostic) {
  return diagnostic.messages.map((d) => {
    var _a;
    let level = import_types.DiagnosticLevel.Error;
    switch (d.severity) {
      case 0:
        level = import_types.DiagnosticLevel.Error;
        return null;
      case 1:
        level = import_types.DiagnosticLevel.Warning;
        break;
      case 2:
        level = import_types.DiagnosticLevel.Error;
        break;
    }
    const loc = {
      start: {
        line: d.line,
        column: d.column
      },
      end: {
        line: d.endLine || 0,
        column: d.endColumn
      }
    };
    const codeFrame = createFrame({
      source: (_a = diagnostic.source) != null ? _a : "",
      location: loc
    });
    return {
      message: `${d.message} (${d.ruleId})`,
      conclusion: "",
      codeFrame,
      stripedCodeFrame: codeFrame && (0, import_strip_ansi.default)(codeFrame),
      id: diagnostic.filePath,
      checker: "ESLint",
      loc,
      level
    };
  }).filter(isNormalizedDiagnostic);
}
function ensureCall(callback) {
  setTimeout(() => {
    callback();
  });
}
function consoleLog(value) {
  var _a;
  if (import_worker_threads.isMainThread) {
    console.log(value);
  } else {
    (_a = import_worker_threads.parentPort) == null ? void 0 : _a.postMessage({
      type: import_types.ACTION_TYPES.console,
      payload: value
    });
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  composeCheckerSummary,
  consoleLog,
  createFrame,
  diagnosticToRuntimeError,
  diagnosticToTerminalLog,
  ensureCall,
  filterLogLevel,
  lspRange2Location,
  normalizeEslintDiagnostic,
  normalizeLspDiagnostic,
  normalizePublishDiagnosticParams,
  normalizeTsDiagnostic,
  normalizeVueTscDiagnostic,
  toViteCustomPayload,
  tsLocationToBabelLocation,
  uriToAbsPath,
  wrapCheckerSummary
});
//# sourceMappingURL=logger.js.map