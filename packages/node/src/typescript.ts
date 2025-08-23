import { createRequire } from 'module';
import { basename, dirname } from 'path';
import { NowBuildError } from '@vercel/build-utils';
import type _ts from 'typescript';

/*
 * Fork of TS-Node - https://github.com/TypeStrong/ts-node
 * Copyright Blake Embrey
 * MIT License
 */

/**
 * Debugging.
 */

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
  compilerOptions?: _ts.CompilerOptions;
  ignoreDiagnostics?: Array<number | string>;
  readFile?: (path: string) => string | undefined;
  fileExists?: (path: string) => boolean;
  transformers?: _ts.CustomTransformers;
  nodeVersionMajor?: number;
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
export type Register = (
  code: string,
  fileName: string,
  skipTypeCheck?: boolean
) => SourceOutput;

const require_ = createRequire(__filename);

/**
 * Maps the config path to a build func
 */
const configFileToBuildMap = new Map<string, GetOutputFunction>();

/**
 * Register TypeScript compiler.
 */
export function register(opts: Options = {}): Register {
  const options = Object.assign({}, DEFAULTS, opts);

  const ignoreDiagnostics = [
    6059, // "'rootDir' is expected to contain all source files."
    18002, // "The 'files' list in config file is empty."
    18003, // "No inputs were found in config file."
    ...(options.ignoreDiagnostics || []),
  ].map(Number);

  // Require the TypeScript compiler and configuration.
  const cwd = options.basePath || process.cwd();
  let compiler: string;
  try {
    compiler = require_.resolve(options.compiler || 'typescript', {
      paths: [options.project || cwd],
    });
  } catch (e) {
    compiler = 'typescript';
  }
  //eslint-disable-next-line @typescript-eslint/no-var-requires
  const ts: typeof _ts = require_(compiler);
  if (compiler === 'typescript') {
    console.log(
      `Using built-in TypeScript ${ts.version} since "typescript" is missing from "devDependencies"`
    );
  } else {
    console.log(`Using TypeScript ${ts.version} (local user-provided)`);
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

  function reportTSError(
    diagnostics: _ts.Diagnostic[],
    shouldExit: boolean | undefined
  ) {
    if (!diagnostics || diagnostics.length === 0) {
      return;
    }
    const message = formatDiagnostics(diagnostics, diagnosticHost);

    if (shouldExit) {
      throw new NowBuildError({ code: 'NODE_TYPESCRIPT_ERROR', message });
    } else {
      // Print error in red color and continue execution.
      console.error(message);
    }
  }

  function getBuild(
    configFileName = '',
    skipTypeCheck?: boolean
  ): GetOutputFunction {
    const cachedGetOutput = configFileToBuildMap.get(configFileName);

    if (cachedGetOutput) {
      return cachedGetOutput;
    }

    const outFiles = new Map<string, SourceOutput>();
    const config = readConfig(configFileName);

    /**
     * Create the basic function for transpile only (ts-node --transpileOnly)
     */
    const getOutputTranspile: GetOutputFunction = (
      code: string,
      fileName: string
    ) => {
      const outFile = outFiles.get(fileName);
      if (outFile) {
        return outFile;
      }
      const result = ts.transpileModule(code, {
        fileName,
        transformers,
        compilerOptions: config.options,
        reportDiagnostics: true,
      });

      const diagnosticList = result.diagnostics
        ? filterDiagnostics(result.diagnostics, ignoreDiagnostics)
        : [];

      reportTSError(diagnosticList, config.options.noEmitOnError);

      const file = {
        code: result.outputText,
        map: result.sourceMapText as string,
      };
      outFiles.set(fileName, file);
      return file;
    };

    /**
     * Create complete function that behaves exactly like `tsc`
     */
    const getOutputTypeCheck: GetOutputFunction = (
      code: string,
      fileName: string
    ) => {
      const outFile = outFiles.get(fileName);
      if (outFile) {
        return outFile;
      }

      // Create a TypeScript program exactly like `tsc` does
      const compilerHost = ts.createCompilerHost(config.options);
      const program = ts.createProgram(
        config.fileNames,
        config.options,
        compilerHost
      );

      // Get program-level diagnostics like `tsc` does
      const diagnostics = ts.getPreEmitDiagnostics(program);
      const diagnosticList = filterDiagnostics(
        Array.from(diagnostics),
        ignoreDiagnostics
      );

      if (process.env.EXPERIMENTAL_NODE_TYPESCRIPT_ERRORS) {
        reportTSError(diagnosticList, true);
      } else {
        reportTSError(diagnosticList, config.options.noEmitOnError);
      }

      // Emit the file like `tsc` does
      // const result = program.emit(
      //   program.getSourceFile(fileName),
      //   undefined,
      //   undefined,
      //   false,
      //   transformers
      // );

      // if (result.emitSkipped) {
      //   throw new TypeError(`${relative(cwd, fileName)}: Emit skipped`);
      // }

      // Since program.emit() doesn't return output files, we need to transpile the specific file
      // This gives us the same result as `tsc` would produce
      const transpileResult = ts.transpileModule(code, {
        fileName,
        transformers,
        compilerOptions: config.options,
        reportDiagnostics: false, // We already checked diagnostics above
      });

      const file = {
        code: transpileResult.outputText,
        map: transpileResult.sourceMapText || '',
      };
      outFiles.set(fileName, file);
      return file;
    };

    const getOutput = skipTypeCheck ? getOutputTranspile : getOutputTypeCheck;
    configFileToBuildMap.set(configFileName, getOutput);

    return getOutput;
  }

  // determine the tsconfig.json path for a given folder
  function detectConfig(): string | undefined {
    let configFileName: string | undefined = undefined;

    // Read project configuration when available.
    configFileName = options.project
      ? ts.findConfigFile(normalizeSlashes(options.project), fileExists)
      : ts.findConfigFile(normalizeSlashes(cwd), fileExists);

    if (configFileName) return normalizeSlashes(configFileName);
  }

  /**
   * Load TypeScript configuration exactly like `tsc` does.
   */
  function readConfig(configFileName: string): _ts.ParsedCommandLine {
    let config: any = { compilerOptions: {} };
    const basePath = normalizeSlashes(dirname(configFileName));

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
        reportTSError(configDiagnosticList, true);
        return errorResult;
      }

      config = result.config;
    }

    // Override default configuration options `ts-node` requires.
    config.compilerOptions = Object.assign(
      {},
      config.compilerOptions,
      options.compilerOptions,
      TS_NODE_COMPILER_OPTIONS
    );

    fixConfig(config, options.nodeVersionMajor);

    // Parse the config exactly like `tsc` does
    const configResult = ts.parseJsonConfigFileContent(
      config,
      ts.sys,
      basePath,
      undefined,
      configFileName
    );

    // Ensure we have project files - this is what `tsc` does automatically
    if (configResult.fileNames.length === 0 && configFileName) {
      // If no files were found, try to expand include patterns like `tsc` does
      const expandedConfig = ts.parseJsonConfigFileContent(
        { ...config, include: config.include || ['**/*'] },
        ts.sys,
        basePath,
        undefined,
        configFileName
      );

      if (expandedConfig.fileNames.length > 0) {
        configResult.fileNames = expandedConfig.fileNames;
      }
    }

    if (configFileName) {
      const configDiagnosticList = filterDiagnostics(
        configResult.errors,
        ignoreDiagnostics
      );
      // Render the configuration errors.
      reportTSError(configDiagnosticList, configResult.options.noEmitOnError);
    }

    return configResult;
  }

  // Create a simple TypeScript compiler proxy.
  function compile(
    code: string,
    fileName: string,
    skipTypeCheck?: boolean
  ): SourceOutput {
    const configFileName = detectConfig();
    const buildOutput = getBuild(configFileName, skipTypeCheck);
    const { code: value, map: sourceMap } = buildOutput(code, fileName);
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

type GetOutputFunction = (code: string, fileName: string) => SourceOutput;

/**
 * Do post-processing on config options to support `ts-node`.
 */
export function fixConfig(
  config: { compilerOptions: any },
  nodeVersionMajor = 12
) {
  if (!config.compilerOptions) {
    config.compilerOptions = {};
  }
  // Delete options that *should not* be passed through.
  delete config.compilerOptions.out;
  delete config.compilerOptions.outFile;
  delete config.compilerOptions.composite;
  delete config.compilerOptions.declarationDir;
  delete config.compilerOptions.declarationMap;
  delete config.compilerOptions.emitDeclarationOnly;
  delete config.compilerOptions.tsBuildInfoFile;
  delete config.compilerOptions.incremental;

  // This will prevent TS from polyfill/downlevel emit.
  if (config.compilerOptions.target === undefined) {
    // See https://github.com/tsconfig/bases/tree/main/bases
    let target: string;
    if (nodeVersionMajor >= 16) {
      target = 'ES2021';
    } else if (nodeVersionMajor >= 14) {
      target = 'ES2020';
    } else {
      target = 'ES2019';
    }
    config.compilerOptions.target = target;
  }

  // When mixing TS with JS, its best to enable this flag.
  // This is useful when no `tsconfig.json` is supplied.
  if (config.compilerOptions.esModuleInterop === undefined) {
    config.compilerOptions.esModuleInterop = true;
  }

  // If not specified, the default Node.js module is CommonJS.
  if (config.compilerOptions.module === undefined) {
    config.compilerOptions.module = 'CommonJS';
  }

  return config;
}

/**
 * Internal source output.
 */
type SourceOutput = { code: string; map: string };

/**
 * Filter diagnostics.
 */
function filterDiagnostics(diagnostics: _ts.Diagnostic[], ignore: number[]) {
  return diagnostics.filter(x => ignore.indexOf(x.code) === -1);
}
