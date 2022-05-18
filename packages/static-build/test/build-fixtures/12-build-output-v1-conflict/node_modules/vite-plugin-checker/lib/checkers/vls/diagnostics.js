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
var diagnostics_exports = {};
__export(diagnostics_exports, {
  TestStream: () => TestStream,
  diagnostics: () => diagnostics,
  logLevel2Severity: () => logLevel2Severity,
  logLevels: () => logLevels,
  prepareClientConnection: () => prepareClientConnection
});
module.exports = __toCommonJS(diagnostics_exports);
var import_chalk = __toESM(require("chalk"));
var import_chokidar = __toESM(require("chokidar"));
var import_fast_glob = __toESM(require("fast-glob"));
var import_fs = __toESM(require("fs"));
var import_os = __toESM(require("os"));
var import_path = __toESM(require("path"));
var import_stream = require("stream");
var import_vls = require("vls");
var import_node = require("vscode-languageserver/node");
var import_vscode_uri = require("vscode-uri");
var import_logger = require("../../logger");
var import_initParams = require("./initParams");
var import_FileDiagnosticManager = require("../../FileDiagnosticManager");
var DOC_VERSION = /* @__PURE__ */ ((DOC_VERSION2) => {
  DOC_VERSION2[DOC_VERSION2["init"] = -1] = "init";
  return DOC_VERSION2;
})(DOC_VERSION || {});
const logLevels = ["ERROR", "WARN", "INFO", "HINT"];
let disposeSuppressConsole;
let initialVueFilesCount = 0;
let initialVueFilesTick = 0;
const fileDiagnosticManager = new import_FileDiagnosticManager.FileDiagnosticManager();
const logLevel2Severity = {
  ERROR: import_node.DiagnosticSeverity.Error,
  WARN: import_node.DiagnosticSeverity.Warning,
  INFO: import_node.DiagnosticSeverity.Information,
  HINT: import_node.DiagnosticSeverity.Hint
};
async function diagnostics(workspace, logLevel, options = { watch: false, verbose: false, config: null }) {
  var _a;
  if (options.verbose) {
    console.log("====================================");
    console.log("Getting Vetur diagnostics");
  }
  let workspaceUri;
  if (workspace) {
    const absPath = import_path.default.resolve(process.cwd(), workspace);
    console.log(`Loading Vetur in workspace path: ${import_chalk.default.green(absPath)}`);
    workspaceUri = import_vscode_uri.URI.file(absPath);
  } else {
    console.log(`Loading Vetur in current directory: ${import_chalk.default.green(process.cwd())}`);
    workspaceUri = import_vscode_uri.URI.file(process.cwd());
  }
  const result = await getDiagnostics(workspaceUri, logLevel2Severity[logLevel], options);
  if (options.verbose) {
    console.log("====================================");
  }
  if (!options.watch && typeof result === "object" && result !== null) {
    const { initialErrorCount, initialWarningCount } = result;
    (_a = options == null ? void 0 : options.onDispatchDiagnosticsSummary) == null ? void 0 : _a.call(options, initialErrorCount, initialWarningCount);
    process.exit(initialErrorCount > 0 ? 1 : 0);
  }
}
class NullLogger {
  error(_message) {
  }
  warn(_message) {
  }
  info(_message) {
  }
  log(_message) {
  }
}
class TestStream extends import_stream.Duplex {
  _write(chunk, _encoding, done) {
    this.emit("data", chunk);
    done();
  }
  _read(_size) {
  }
}
function suppressConsole() {
  let disposed = false;
  const rawConsoleLog = console.log;
  console.log = () => {
  };
  return () => {
    if (disposed)
      return;
    disposed = true;
    console.log = rawConsoleLog;
  };
}
async function prepareClientConnection(workspaceUri, severity, options) {
  const up = new TestStream();
  const down = new TestStream();
  const logger = new NullLogger();
  const clientConnection = (0, import_node.createProtocolConnection)(new import_node.StreamMessageReader(down), new import_node.StreamMessageWriter(up), logger);
  const serverConnection = (0, import_node.createConnection)(new import_node.StreamMessageReader(up), new import_node.StreamMessageWriter(down));
  serverConnection.sendDiagnostics = async (publishDiagnostics) => {
    var _a, _b;
    disposeSuppressConsole == null ? void 0 : disposeSuppressConsole();
    if (publishDiagnostics.version === -1 /* init */) {
      return;
    }
    const absFilePath = import_vscode_uri.URI.parse(publishDiagnostics.uri).fsPath;
    publishDiagnostics.diagnostics = filterDiagnostics(publishDiagnostics.diagnostics, severity);
    const nextDiagnosticInFile = await (0, import_logger.normalizePublishDiagnosticParams)(publishDiagnostics);
    fileDiagnosticManager.updateByFileId(absFilePath, nextDiagnosticInFile);
    const normalized = fileDiagnosticManager.getDiagnostics();
    const errorCount = normalized.filter((d) => d.level === import_node.DiagnosticSeverity.Error).length;
    const warningCount = normalized.filter((d) => d.level === import_node.DiagnosticSeverity.Warning).length;
    initialVueFilesTick++;
    if (initialVueFilesTick >= initialVueFilesCount) {
      (_a = options.onDispatchDiagnostics) == null ? void 0 : _a.call(options, normalized);
      (_b = options.onDispatchDiagnosticsSummary) == null ? void 0 : _b.call(options, errorCount, warningCount);
    }
  };
  const vls = new import_vls.VLS(serverConnection);
  vls.validateTextDocument = async (textDocument, cancellationToken) => {
    const diagnostics2 = await vls.doValidate(textDocument, cancellationToken);
    if (diagnostics2) {
      vls.lspConnection.sendDiagnostics({
        uri: textDocument.uri,
        version: textDocument.version,
        diagnostics: diagnostics2
      });
    }
  };
  serverConnection.onInitialize(async (params) => {
    await vls.init(params);
    if (options.verbose) {
      console.log("Vetur initialized");
      console.log("====================================");
    }
    return {
      capabilities: vls.capabilities
    };
  });
  vls.listen();
  clientConnection.listen();
  const initParams = (0, import_initParams.getInitParams)(workspaceUri);
  if (options.config) {
    mergeDeep(initParams.initializationOptions.config, options.config);
  }
  await clientConnection.sendRequest(import_node.InitializeRequest.type, initParams);
  return { clientConnection, serverConnection, vls, up, down, logger };
}
function extToGlobs(exts) {
  return exts.map((e) => "**/*" + e);
}
const watchedDidChangeContent = [".vue"];
const watchedDidChangeWatchedFiles = [".js", ".ts", ".json"];
const watchedDidChangeContentGlob = extToGlobs(watchedDidChangeContent);
async function getDiagnostics(workspaceUri, severity, options) {
  const { clientConnection } = await prepareClientConnection(workspaceUri, severity, options);
  const files = import_fast_glob.default.sync([...watchedDidChangeContentGlob], {
    cwd: workspaceUri.fsPath,
    ignore: ["node_modules/**"]
  });
  if (files.length === 0) {
    console.log("[VLS checker] No input files");
    return { initialWarningCount: 0, initialErrorCount: 0 };
  }
  if (options.verbose) {
    console.log("");
    console.log("Getting diagnostics from: ", files, "\n");
  }
  const absFilePaths = files.map((f) => import_path.default.resolve(workspaceUri.fsPath, f));
  disposeSuppressConsole = suppressConsole();
  initialVueFilesCount = absFilePaths.length;
  let initialErrorCount = 0;
  let initialWarningCount = 0;
  await Promise.all(absFilePaths.map(async (absFilePath) => {
    const fileText = await import_fs.default.promises.readFile(absFilePath, "utf-8");
    clientConnection.sendNotification(import_node.DidOpenTextDocumentNotification.type, {
      textDocument: {
        languageId: "vue",
        uri: import_vscode_uri.URI.file(absFilePath).toString(),
        version: -1 /* init */,
        text: fileText
      }
    });
    if (!options.watch) {
      try {
        let diagnostics2 = await clientConnection.sendRequest("$/getDiagnostics", {
          uri: import_vscode_uri.URI.file(absFilePath).toString(),
          version: -1 /* init */
        });
        diagnostics2 = filterDiagnostics(diagnostics2, severity);
        let logChunk = "";
        if (diagnostics2.length > 0) {
          logChunk += import_os.default.EOL + diagnostics2.map((d) => (0, import_logger.diagnosticToTerminalLog)((0, import_logger.normalizeLspDiagnostic)({
            diagnostic: d,
            absFilePath,
            fileText
          }), "VLS")).join(import_os.default.EOL);
          diagnostics2.forEach((d) => {
            if (d.severity === import_node.DiagnosticSeverity.Error) {
              initialErrorCount++;
            }
            if (d.severity === import_node.DiagnosticSeverity.Warning) {
              initialWarningCount++;
            }
          });
        }
        console.log(logChunk);
        return { initialErrorCount, initialWarningCount };
      } catch (err) {
        console.error(err.stack);
        return { initialErrorCount, initialWarningCount };
      }
    }
  }));
  if (!options.watch) {
    return { initialErrorCount, initialWarningCount };
  }
  await Promise.all(absFilePaths.map(async (absFilePath) => {
    const fileText = await import_fs.default.promises.readFile(absFilePath, "utf-8");
    clientConnection.sendNotification(import_node.DidOpenTextDocumentNotification.type, {
      textDocument: {
        languageId: "vue",
        uri: import_vscode_uri.URI.file(absFilePath).toString(),
        version: -1 /* init */,
        text: fileText
      }
    });
  }));
  const watcher = import_chokidar.default.watch([], {
    ignored: (path2) => path2.includes("node_modules")
  });
  watcher.add(workspaceUri.fsPath);
  watcher.on("all", async (event, filePath) => {
    const extname = import_path.default.extname(filePath);
    if (!filePath.endsWith(".vue"))
      return;
    const fileContent = await import_fs.default.promises.readFile(filePath, "utf-8");
    clientConnection.sendNotification(import_node.DidChangeTextDocumentNotification.type, {
      textDocument: {
        uri: import_vscode_uri.URI.file(filePath).toString(),
        version: Date.now()
      },
      contentChanges: [{ text: fileContent }]
    });
    if (watchedDidChangeWatchedFiles.includes(extname)) {
      clientConnection.sendNotification(import_node.DidChangeWatchedFilesNotification.type, {
        changes: [
          {
            uri: import_vscode_uri.URI.file(filePath).toString(),
            type: event === "add" ? 1 : event === "unlink" ? 3 : 2
          }
        ]
      });
    }
  });
  return null;
}
function isObject(item) {
  return item && typeof item === "object" && !Array.isArray(item);
}
function mergeDeep(target, source) {
  if (isObject(target) && isObject(source)) {
    for (const key in source) {
      if (isObject(source[key])) {
        if (!target[key])
          Object.assign(target, { [key]: {} });
        mergeDeep(target[key], source[key]);
      } else {
        Object.assign(target, { [key]: source[key] });
      }
    }
  }
  return target;
}
function filterDiagnostics(diagnostics2, severity) {
  return diagnostics2.filter((r) => r.source !== "eslint-plugin-vue").filter((r) => r.severity && r.severity <= severity);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  TestStream,
  diagnostics,
  logLevel2Severity,
  logLevels,
  prepareClientConnection
});
//# sourceMappingURL=diagnostics.js.map