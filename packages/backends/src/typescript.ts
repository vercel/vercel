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

/**
 * Typecheck via the TypeScript compiler API (`createProgram`, `getPreEmitDiagnostics`),
 * not by spawning the `tsc` binary.
 *
 * We only want to validate the deployment entrypoint and its import graph, not every
 * file matched by `tsconfig` `include`. The CLI cannot combine `--project` with explicit
 * root files (TS5042), so expressing 'project options + entry-only roots' in one `tsc`
 * call requires a generated tsconfig on disk. Writing beside the user's config is
 * invasive; a temp config elsewhere often breaks `node_modules` / `@types` resolution
 * relative to the real project. The API lets us reuse `parseJsonConfigFileContent` (same
 * options as `-p`) with explicit `rootNames`, no files written, and a compiler host whose
 * current directory stays `workPath`.
 *
 * The `typescript` package is resolved with `require` from the user's app (peer dependency), not bundled.
 */

const require_ = createRequire(import.meta.url);

type TypeScriptModule = typeof import('typescript');

export const typescript = (args: TypescriptOptions) => {
  const { span } = args;
  const tsSpan = span.child('vc.builder.backends.tsCompile');

  return tsSpan.trace(async () => {
    const extension = extname(args.entrypoint);
    const isTypeScript = ['.ts', '.mts', '.cts'].includes(extension);

    if (!isTypeScript) {
      return;
    }

    const ts = resolveTypeScriptModule(args.workPath);
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
  args: { entrypoint: string; workPath: string },
  ts: TypeScriptModule
): Promise<void> {
  const entryAbsolute = resolve(args.workPath, args.entrypoint);
  const tsconfig = await findNearestTsconfig(args.workPath);

  const formatDiagnostics = process.stdout.isTTY
    ? ts.formatDiagnosticsWithColorAndContext
    : ts.formatDiagnostics;
  const diagnosticHost: FormatDiagnosticsHost = {
    getNewLine: () => ts.sys.newLine,
    getCanonicalFileName: (fileName: string) =>
      ts.sys.useCaseSensitiveFileNames ? fileName : fileName.toLowerCase(),
    getCurrentDirectory: () => args.workPath,
  };

  let options: CompilerOptions;
  let parseDiagnostics: readonly Diagnostic[] = [];

  if (tsconfig) {
    const configRead = ts.readConfigFile(tsconfig, ts.sys.readFile);
    if (configRead.error) {
      const message = formatDiagnostics([configRead.error], diagnosticHost);
      console.error('\nTypeScript type check failed:\n');
      console.error(message);
      throw new Error('TypeScript type check failed');
    }
    const parsed = ts.parseJsonConfigFileContent(
      configRead.config,
      ts.sys,
      dirname(tsconfig),
      undefined,
      tsconfig
    );
    parseDiagnostics = parsed.errors;
    options = {
      ...parsed.options,
      noEmit: true,
      skipLibCheck: true,
      allowJs: true,
      esModuleInterop: true,
    };
  } else {
    options = {
      noEmit: true,
      skipLibCheck: true,
      allowJs: true,
      esModuleInterop: true,
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
    };
  }

  const compilerHost = ts.createCompilerHost(options);
  compilerHost.getCurrentDirectory = () => args.workPath;

  const program = ts.createProgram([entryAbsolute], options, compilerHost);
  const diagnostics = [
    ...parseDiagnostics,
    ...ts.getPreEmitDiagnostics(program),
  ];
  const errors = diagnostics.filter(
    d => d.category === ts.DiagnosticCategory.Error
  );

  if (errors.length === 0) {
    console.log(c.gray(`${c.bold(c.cyan('✓'))} Typecheck complete`));
    return;
  }

  const output = formatDiagnostics(errors, diagnosticHost);
  console.error('\nTypeScript type check failed:\n');
  console.error(output);
  throw new Error('TypeScript type check failed');
}

function resolveTypeScriptModule(workPath: string): TypeScriptModule | null {
  try {
    const id = require_.resolve('typescript', { paths: [workPath] });
    return require_(id) as TypeScriptModule;
  } catch (_e) {
    return null;
  }
}

export const findNearestTsconfig = async (
  workPath: string
): Promise<string | undefined> => {
  const tsconfigPath = join(workPath, 'tsconfig.json');
  if (existsSync(tsconfigPath)) {
    return tsconfigPath;
  }
  if (workPath === '/') {
    return undefined;
  }
  return findNearestTsconfig(join(workPath, '..'));
};
