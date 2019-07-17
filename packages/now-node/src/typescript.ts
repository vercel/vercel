import { relative, basename, resolve, dirname } from 'path';
import _ts from 'typescript';

/*
 * Fork of TS-Node - https://github.com/TypeStrong/ts-node
 * Copyright Blake Embrey
 * MIT License
 */

/**
 * Debugging `ts-node`.
 */
const shouldDebug = false;
const debug = shouldDebug
  ? console.log.bind(console, 'ts-node')
  : () => undefined;
const debugFn = shouldDebug
  ? <T, U>(key: string, fn: (arg: T) => U) => {
      let i = 0;
      return (x: T) => {
        debug(key, x, ++i);
        return fn(x);
      };
    }
  : <T, U>(_: string, fn: (arg: T) => U) => fn;

/**
 * Common TypeScript interfaces between versions.
 */
interface TSCommon {
  version: typeof _ts.version;
  sys: typeof _ts.sys;
  ScriptSnapshot: typeof _ts.ScriptSnapshot;
  displayPartsToString: typeof _ts.displayPartsToString;
  createLanguageService: typeof _ts.createLanguageService;
  getDefaultLibFilePath: typeof _ts.getDefaultLibFilePath;
  getPreEmitDiagnostics: typeof _ts.getPreEmitDiagnostics;
  flattenDiagnosticMessageText: typeof _ts.flattenDiagnosticMessageText;
  transpileModule: typeof _ts.transpileModule;
  ModuleKind: typeof _ts.ModuleKind;
  ScriptTarget: typeof _ts.ScriptTarget;
  findConfigFile: typeof _ts.findConfigFile;
  readConfigFile: typeof _ts.readConfigFile;
  parseJsonConfigFileContent: typeof _ts.parseJsonConfigFileContent;
  formatDiagnostics: typeof _ts.formatDiagnostics;
  formatDiagnosticsWithColorAndContext: typeof _ts.formatDiagnosticsWithColorAndContext;
}

/**
 * Registration options.
 */
interface Options {
  basePath?: string;
  pretty?: boolean | null;
  logError?: boolean | null;
  files?: boolean | null;
  compiler?: string;
  ignore?: string[];
  project?: string;
  compilerOptions?: object;
  ignoreDiagnostics?: Array<number | string>;
  readFile?: (path: string) => string | undefined;
  fileExists?: (path: string) => boolean;
  transformers?: _ts.CustomTransformers;
}

/**
 * Track the project information.
 */
class MemoryCache {
  fileContents = new Map<string, string>();
  fileVersions = new Map<string, number>();

  constructor(rootFileNames: string[] = []) {
    for (const fileName of rootFileNames) this.fileVersions.set(fileName, 1);
  }
}

/**
 * Default register options.
 */
const DEFAULTS: Options = {
  files: null,
  pretty: null,
  compiler: undefined,
  compilerOptions: undefined,
  ignore: undefined,
  project: undefined,
  ignoreDiagnostics: undefined,
  logError: null,
};

/**
 * Default TypeScript compiler options required by `ts-node`.
 */
const TS_NODE_COMPILER_OPTIONS = {
  sourceMap: true,
  inlineSourceMap: false,
  inlineSources: true,
  declaration: false,
  noEmit: false,
  outDir: '$$ts-node$$',
};

/**
 * Replace backslashes with forward slashes.
 */
function normalizeSlashes(value: string): string {
  return value.replace(/\\/g, '/');
}

/**
 * Return type for registering `ts-node`.
 */
export type Compile = (
  code: string,
  fileName: string,
  skipTypeCheck?: boolean
) => { code: string; map: string };

/**
 * Cached fs operation wrapper.
 */
function cachedLookup<T>(fn: (arg: string) => T): (arg: string) => T {
  const cache = new Map<string, T>();

  return (arg: string): T => {
    if (!cache.has(arg)) {
      cache.set(arg, fn(arg));
    }

    return cache.get(arg)!;
  };
}

/**
 * Register TypeScript compiler.
 */
export function init(opts: Options = {}): Compile {
  const options = Object.assign({}, DEFAULTS, opts);

  const ignoreDiagnostics = [
    6059, // "'rootDir' is expected to contain all source files."
    18002, // "The 'files' list in config file is empty."
    18003, // "No inputs were found in config file."
    ...(options.ignoreDiagnostics || []),
  ].map(Number);

  // Require the TypeScript compiler and configuration.
  const cwd = options.basePath || process.cwd();
  const nowNodeBase = resolve(__dirname, '../../../');
  try {
    var compiler = require.resolve(options.compiler || 'typescript', {
      paths: [cwd, nowNodeBase],
    });
  } catch (e) {
    compiler = require.resolve(eval('"./typescript"'));
  }
  const ts: typeof _ts = require(compiler);
  if (compiler.startsWith(nowNodeBase)) {
    console.log('Using TypeScript ' + ts.version + ' (now internal)');
  } else {
    console.log('Using TypeScript ' + ts.version + ' (local user-provided)');
  }
  const transformers = options.transformers || undefined;
  const readFile = options.readFile || ts.sys.readFile;
  const fileExists = options.fileExists || ts.sys.fileExists;

  const formatDiagnostics =
    process.stdout.isTTY || options.pretty
      ? ts.formatDiagnosticsWithColorAndContext
      : ts.formatDiagnostics;

  const diagnosticHost: _ts.FormatDiagnosticsHost = {
    getNewLine: () => ts.sys.newLine,
    getCurrentDirectory: () => cwd,
    getCanonicalFileName: path => path,
  };

  function createTSError(diagnostics: ReadonlyArray<_ts.Diagnostic>) {
    const diagnosticText = formatDiagnostics(diagnostics, diagnosticHost);
    return new Error(diagnosticText);
  }

  function reportTSError(configDiagnosticList: _ts.Diagnostic[]) {
    const error = createTSError(configDiagnosticList);
    if (options.logError) {
      // Print error in red color and continue execution.
      console.error('\x1b[31m%s\x1b[0m', error);
    } else {
      // Throw error and exit the script.
      throw error;
    }
  }

  // we create a custom build per tsconfig.json instance
  const builds = new Map<string, Build>();
  function getBuild(configFileName: string = ''): Build {
    let build = builds.get(configFileName);
    if (build) return build;

    const config = readConfig(configFileName);

    /**
     * Create the basic required function using transpile mode.
     */
    let getOutput = function(code: string, fileName: string): [string, string] {
      const result = ts.transpileModule(code, {
        fileName,
        transformers,
        compilerOptions: config.options,
        reportDiagnostics: true,
      });

      const diagnosticList = result.diagnostics
        ? filterDiagnostics(result.diagnostics, ignoreDiagnostics)
        : [];

      if (diagnosticList.length) reportTSError(diagnosticList);

      return [result.outputText, result.sourceMapText as string];
    };

    // Use full language services when the fast option is disabled.
    let getOutputTypeCheck: (
      code: string,
      fileName: string
    ) => [string, string];
    {
      const memoryCache = new MemoryCache(config.fileNames);
      const cachedReadFile = cachedLookup(debugFn('readFile', readFile));

      // Create the compiler host for type checking.
      const serviceHost: _ts.LanguageServiceHost = {
        getScriptFileNames: () => Array.from(memoryCache.fileVersions.keys()),
        getScriptVersion: (fileName: string) => {
          const version = memoryCache.fileVersions.get(fileName);
          return version === undefined ? '' : version.toString();
        },
        getScriptSnapshot(fileName: string) {
          let contents = memoryCache.fileContents.get(fileName);

          // Read contents into TypeScript memory cache.
          if (contents === undefined) {
            contents = cachedReadFile(fileName);
            if (contents === undefined) return;

            memoryCache.fileVersions.set(fileName, 1);
            memoryCache.fileContents.set(fileName, contents);
          }

          return ts.ScriptSnapshot.fromString(contents);
        },
        readFile: cachedReadFile,
        readDirectory: cachedLookup(
          debugFn('readDirectory', ts.sys.readDirectory)
        ),
        getDirectories: cachedLookup(
          debugFn('getDirectories', ts.sys.getDirectories)
        ),
        fileExists: cachedLookup(debugFn('fileExists', fileExists)),
        directoryExists: cachedLookup(
          debugFn('directoryExists', ts.sys.directoryExists)
        ),
        getNewLine: () => ts.sys.newLine,
        useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
        getCurrentDirectory: () => cwd,
        getCompilationSettings: () => config.options,
        getDefaultLibFileName: () => ts.getDefaultLibFilePath(config.options),
        getCustomTransformers: () => transformers,
      };

      const registry = ts.createDocumentRegistry(
        ts.sys.useCaseSensitiveFileNames,
        cwd
      );
      const service = ts.createLanguageService(serviceHost, registry);

      // Set the file contents into cache manually.
      const updateMemoryCache = function(contents: string, fileName: string) {
        const fileVersion = memoryCache.fileVersions.get(fileName) || 0;

        // Avoid incrementing cache when nothing has changed.
        if (memoryCache.fileContents.get(fileName) === contents) return;

        memoryCache.fileVersions.set(fileName, fileVersion + 1);
        memoryCache.fileContents.set(fileName, contents);
      };

      getOutputTypeCheck = function(code: string, fileName: string) {
        updateMemoryCache(code, fileName);

        const output = service.getEmitOutput(fileName);

        // Get the relevant diagnostics - this is 3x faster than `getPreEmitDiagnostics`.
        const diagnostics = service
          .getSemanticDiagnostics(fileName)
          .concat(service.getSyntacticDiagnostics(fileName));

        const diagnosticList = filterDiagnostics(
          diagnostics,
          ignoreDiagnostics
        );

        if (diagnosticList.length) reportTSError(diagnosticList);

        if (output.emitSkipped) {
          throw new TypeError(`${relative(cwd, fileName)}: Emit skipped`);
        }

        // Throw an error when requiring `.d.ts` files.
        if (output.outputFiles.length === 0) {
          throw new TypeError(
            'Unable to require `.d.ts` file.\n' +
              'This is usually the result of a faulty configuration or import. ' +
              'Make sure there is a `.js`, `.json` or another executable extension and ' +
              'loader (attached before `ts-node`) available alongside ' +
              `\`${basename(fileName)}\`.`
          );
        }

        return [output.outputFiles[1].text, output.outputFiles[0].text];
      };
    }

    builds.set(
      configFileName,
      (build = {
        getOutput,
        getOutputTypeCheck,
      })
    );
    return build;
  }

  // determine the tsconfig.json path for a given folder
  function detectConfig(basePath: string): string | undefined {
    basePath = normalizeSlashes(basePath);
    let configFileName: string | undefined = undefined;

    // Read project configuration when available.
    configFileName = options.project
      ? normalizeSlashes(resolve(cwd, options.project))
      : ts.findConfigFile(normalizeSlashes(cwd), fileExists);

    if (configFileName) return normalizeSlashes(configFileName);
  }

  /**
   * Load TypeScript configuration.
   */
  function readConfig(configFileName: string): _ts.ParsedCommandLine {
    let config: any = { compilerOptions: {} };
    let basePath = normalizeSlashes(dirname(configFileName));

    // Read project configuration when available.
    if (configFileName) {
      const result = ts.readConfigFile(configFileName, readFile);

      // Return diagnostics.
      if (result.error) {
        const errorResult = {
          errors: [result.error],
          fileNames: [],
          options: {},
        };
        const configDiagnosticList = filterDiagnostics(
          errorResult.errors,
          ignoreDiagnostics
        );
        // Render the configuration errors.
        if (configDiagnosticList.length) reportTSError(configDiagnosticList);
        return errorResult;
      }

      config = result.config;
    }

    // Remove resolution of "files".
    if (!options.files) {
      config.files = [];
      config.include = [];
    }

    // Override default configuration options `ts-node` requires.
    config.compilerOptions = Object.assign(
      {},
      config.compilerOptions,
      options.compilerOptions,
      TS_NODE_COMPILER_OPTIONS
    );

    const configResult = fixConfig(
      ts,
      ts.parseJsonConfigFileContent(
        config,
        ts.sys,
        basePath,
        undefined,
        configFileName
      )
    );

    if (configFileName) {
      const configDiagnosticList = filterDiagnostics(
        configResult.errors,
        ignoreDiagnostics
      );
      // Render the configuration errors.
      if (configDiagnosticList.length) reportTSError(configDiagnosticList);
    }

    return configResult;
  }

  // Create a simple TypeScript compiler proxy.
  function compile(code: string, fileName: string, skipTypeCheck?: boolean) {
    const configFileName = detectConfig(fileName);
    const build = getBuild(configFileName);
    const [value, sourceMap] = (skipTypeCheck
      ? build.getOutput
      : build.getOutputTypeCheck)(code, fileName);
    const output = {
      code: value,
      map: Object.assign(JSON.parse(sourceMap), {
        file: basename(fileName),
        sources: [fileName],
      }),
    };
    delete output.map.sourceRoot;
    return output;
  }

  return compile;
}

interface Build {
  getOutput(code: string, fileName: string): [string, string];
  getOutputTypeCheck(code: string, fileName: string): [string, string];
}

/**
 * Do post-processing on config options to support `ts-node`.
 */
function fixConfig(ts: TSCommon, config: _ts.ParsedCommandLine) {
  // Delete options that *should not* be passed through.
  delete config.options.out;
  delete config.options.outFile;
  delete config.options.composite;
  delete config.options.declarationDir;
  delete config.options.declarationMap;
  delete config.options.emitDeclarationOnly;
  delete config.options.tsBuildInfoFile;
  delete config.options.incremental;

  // Target ES5 output by default (instead of ES3).
  if (config.options.target === undefined) {
    config.options.target = ts.ScriptTarget.ESNext;
  }

  // Target CommonJS, always!
  config.options.module = ts.ModuleKind.CommonJS;

  return config;
}

/**
 * Filter diagnostics.
 */
function filterDiagnostics(diagnostics: _ts.Diagnostic[], ignore: number[]) {
  return diagnostics.filter(x => ignore.indexOf(x.code) === -1);
}
