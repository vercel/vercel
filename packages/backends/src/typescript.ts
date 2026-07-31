import { createRequire } from 'node:module';
import { dirname, extname, join, resolve } from 'node:path';
import { Colors as c } from './cervel/utils.js';
import { existsSync } from 'node:fs';
import type {
  CompilerOptions,
  Diagnostic,
  FormatDiagnosticsHost,
} from 'typescript';
import type { TypescriptOptions } from './cervel/types.js';

const require_ = createRequire(import.meta.url);

type TypeScriptModule = typeof import('typescript');

// Diagnostic codes that `@vercel/node` ignores:
// 6059: "'rootDir' is expected to contain all source files."
// 18002: "The 'files' list in config file is empty."
// 18003: "No inputs were found in config file."
const IGNORED_DIAGNOSTIC_CODES = new Set([6059, 18002, 18003]);

export const typescript = (args: TypescriptOptions) => {
  const { span } = args;
  const tsSpan = span.child('vc.builder.backends.tsCompile');

  return tsSpan.trace(async () => {
    const extension = extname(args.entrypoint);
    const isTypeScript = ['.ts', '.mts', '.cts'].includes(extension);

    if (!isTypeScript) {
      return;
    }

    const ts = resolveTypeScriptModule(
      dirname(resolve(args.workPath, args.entrypoint))
    );
    if (!ts) {
      console.log(
        c.gray(
          `${c.bold(c.cyan('✓'))} Typecheck skipped ${c.gray(
            '(TypeScript not found)'
          )}`
        )
      );
      return null;
    }

    return doTypeCheck(args, ts);
  });
};

async function doTypeCheck(
  args: { entrypoint: string; workPath: string; nodeVersionMajor?: number },
  ts: TypeScriptModule
): Promise<void> {
  const entryAbsolute = resolve(args.workPath, args.entrypoint);
  const tsconfig = findNearestTsconfig(dirname(entryAbsolute));

  const formatDiagnostics = process.stdout.isTTY
    ? ts.formatDiagnosticsWithColorAndContext
    : ts.formatDiagnostics;
  const diagnosticHost: FormatDiagnosticsHost = {
    getNewLine: () => ts.sys.newLine,
    getCanonicalFileName: (fileName: string) =>
      ts.sys.useCaseSensitiveFileNames ? fileName : fileName.toLowerCase(),
    getCurrentDirectory: () => args.workPath,
  };

  const filterIgnored = (diagnostics: readonly Diagnostic[]) =>
    diagnostics.filter(d => !IGNORED_DIAGNOSTIC_CODES.has(d.code));

  const fail = (diagnostics: readonly Diagnostic[]): never => {
    const message = formatDiagnostics(diagnostics, diagnosticHost);
    console.error('\nTypeScript type check failed:\n');
    console.error(message);
    throw new Error('TypeScript type check failed');
  };

  let options: CompilerOptions;
  const rootNames = [entryAbsolute];

  if (tsconfig) {
    const configRead = ts.readConfigFile(tsconfig, ts.sys.readFile);
    if (configRead.error) {
      fail([configRead.error]);
    }
    const config = configRead.config ?? {};
    config.compilerOptions = fixConfig(
      { ...config.compilerOptions },
      args.nodeVersionMajor
    );
    const parsed = ts.parseJsonConfigFileContent(
      config,
      ts.sys,
      dirname(tsconfig),
      undefined,
      tsconfig
    );
    const parseErrors = filterIgnored(parsed.errors).filter(
      d => d.category === ts.DiagnosticCategory.Error
    );
    if (parseErrors.length > 0) {
      if (parsed.options.noEmitOnError) {
        fail(parseErrors);
      } else {
        console.error(formatDiagnostics(parseErrors, diagnosticHost));
      }
    }
    options = {
      ...parsed.options,
      noEmit: true,
      skipLibCheck: true,
      allowJs: true,
    };
    // Ambient declaration files matched by the tsconfig contribute global
    // types even when never imported; include them as extra program roots.
    for (const fileName of parsed.fileNames) {
      if (/\.d\.(ts|mts|cts)$/.test(fileName) && fileName !== entryAbsolute) {
        rootNames.push(fileName);
      }
    }
  } else {
    options = {
      noEmit: true,
      skipLibCheck: true,
      allowJs: true,
      esModuleInterop: true,
      target: defaultScriptTarget(ts, args.nodeVersionMajor),
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      strict: false,
    };
  }

  const compilerHost = ts.createCompilerHost(options);
  compilerHost.getCurrentDirectory = () => args.workPath;

  const program = ts.createProgram(rootNames, options, compilerHost);
  const diagnostics = filterIgnored(ts.getPreEmitDiagnostics(program));
  const errors = diagnostics.filter(
    d => d.category === ts.DiagnosticCategory.Error
  );

  if (errors.length === 0) {
    console.log(c.gray(`${c.bold(c.cyan('✓'))} Typecheck complete`));
    return;
  }

  fail(errors);
}

// Mirror of `fixConfig` in `packages/node/src/typescript.ts`.
export function fixConfig(
  compilerOptions: Record<string, unknown>,
  nodeVersionMajor = 16
): Record<string, unknown> {
  delete compilerOptions.out;
  delete compilerOptions.outFile;
  delete compilerOptions.composite;
  delete compilerOptions.declarationDir;
  delete compilerOptions.declarationMap;
  delete compilerOptions.emitDeclarationOnly;
  delete compilerOptions.tsBuildInfoFile;
  delete compilerOptions.incremental;

  if (compilerOptions.target === undefined) {
    let target: string;
    if (nodeVersionMajor >= 16) {
      target = 'ES2021';
    } else if (nodeVersionMajor >= 14) {
      target = 'ES2020';
    } else {
      target = 'ES2019';
    }
    compilerOptions.target = target;
  }

  if (compilerOptions.esModuleInterop === undefined) {
    compilerOptions.esModuleInterop = true;
  }

  if (compilerOptions.module === undefined) {
    compilerOptions.module = 'NodeNext';
    compilerOptions.moduleResolution = 'NodeNext';
    compilerOptions.strict = false;
  }

  return compilerOptions;
}

function defaultScriptTarget(
  ts: TypeScriptModule,
  nodeVersionMajor = 16
): import('typescript').ScriptTarget {
  if (nodeVersionMajor >= 16) return ts.ScriptTarget.ES2021;
  if (nodeVersionMajor >= 14) return ts.ScriptTarget.ES2020;
  return ts.ScriptTarget.ES2019;
}

function resolveTypeScriptModule(startDir: string): TypeScriptModule | null {
  try {
    const id = require_.resolve('typescript', { paths: [startDir] });
    const ts = require_(id) as TypeScriptModule;
    console.log(`Using TypeScript ${ts.version} (local user-provided)`);
    return ts;
  } catch (_e) {
    return null;
  }
}

export const findNearestTsconfig = (startDir: string): string | undefined => {
  let dir = resolve(startDir);
  for (;;) {
    const tsconfigPath = join(dir, 'tsconfig.json');
    if (existsSync(tsconfigPath)) {
      return tsconfigPath;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
};
