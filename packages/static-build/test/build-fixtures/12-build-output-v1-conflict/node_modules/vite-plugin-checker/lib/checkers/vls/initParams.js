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
var initParams_exports = {};
__export(initParams_exports, {
  getDefaultVLSConfig: () => getDefaultVLSConfig,
  getInitParams: () => getInitParams
});
module.exports = __toCommonJS(initParams_exports);
function getInitParams(workspaceUri) {
  const defaultVLSConfig = getDefaultVLSConfig();
  defaultVLSConfig.vetur.validation = {
    template: true,
    style: true,
    script: true,
    interpolation: true,
    templateProps: true
  };
  defaultVLSConfig.vetur.experimental = {
    templateInterpolationService: true
  };
  const init = {
    rootPath: workspaceUri.fsPath,
    rootUri: workspaceUri.toString(),
    processId: process.pid,
    capabilities: {},
    initializationOptions: {
      config: defaultVLSConfig
    }
  };
  return init;
}
function getDefaultVLSConfig() {
  return {
    vetur: {
      ignoreProjectWarning: false,
      useWorkspaceDependencies: false,
      validation: {
        template: true,
        templateProps: true,
        interpolation: true,
        style: true,
        script: true
      },
      completion: {
        autoImport: false,
        tagCasing: "initial",
        scaffoldSnippetSources: {
          workspace: "\u{1F4BC}",
          user: "\u{1F5D2}\uFE0F",
          vetur: "\u270C"
        }
      },
      grammar: {
        customBlocks: {}
      },
      format: {
        enable: true,
        options: {
          tabSize: 2,
          useTabs: false
        },
        defaultFormatter: {},
        defaultFormatterOptions: {},
        scriptInitialIndent: false,
        styleInitialIndent: false
      },
      languageFeatures: {
        codeActions: true,
        updateImportOnFileMove: true,
        semanticTokens: true
      },
      trace: {
        server: "off"
      },
      dev: {
        vlsPath: "",
        vlsPort: -1,
        logLevel: "INFO"
      },
      experimental: {
        templateInterpolationService: false
      }
    },
    css: {},
    html: {
      suggest: {}
    },
    javascript: {
      format: {}
    },
    typescript: {
      tsdk: null,
      format: {}
    },
    emmet: {},
    stylusSupremacy: {}
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  getDefaultVLSConfig,
  getInitParams
});
//# sourceMappingURL=initParams.js.map