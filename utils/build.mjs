import execa from 'execa';
import ts from 'typescript';
import path from 'node:path';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

function parseTsConfig(tsconfigPath) {
  const parsedConfig = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (parsedConfig.error) {
    console.error(
      'Error parsing tsconfig:',
      ts.flattenDiagnosticMessageText(parsedConfig.error.messageText, '\n')
    );
    return;
  }

  const result = ts.parseJsonConfigFileContent(
    parsedConfig.config,
    ts.sys,
    path.dirname(tsconfigPath)
  );
  if (result.errors && result.errors.length > 0) {
    for (const error of result.errors) {
      console.error(ts.flattenDiagnosticMessageText(error.messageText, '\n'));
    }
    return;
  }
  return result;
}

export async function esbuild(
  /** @type {import('esbuild').BuildOptions} */ opts = {},
  cwd = process.cwd()
) {
  const configPath = path.join(cwd, 'tsconfig.json');
  const tsconfig = parseTsConfig(configPath);

  if (!tsconfig) {
    throw new Error(`Failed to load "${configPath}`);
  }

  const entryPoints = opts.bundle
    ? // When bundling, assume `src/index.ts` is the entrypoint file
      [path.join(cwd, 'src/index.ts')]
    : // When not bundling, compile all files referenced by the `tsconfig.json` file
      tsconfig.fileNames;

  let outdir = opts.outfile ? undefined : tsconfig.options.outDir;

  await build({
    entryPoints,
    format: 'cjs',
    outdir,
    platform: 'node',
    target: ts.ScriptTarget[tsconfig.options.target],
    sourcemap: tsconfig.options.sourceMap,
    ...opts,
  });
}

export async function tsc() {
  const rootNodeModulesBin = fileURLToPath(
    new URL('../node_modules/.bin', import.meta.url)
  );
  await execa('tsc', ['--declaration', '--emitDeclarationOnly'], {
    stdio: 'inherit',
    env: {
      ...process.env,
      PATH: `${rootNodeModulesBin}${path.delimiter}${process.env.PATH}`,
    },
  });
}

// If the script is invoked directly, do the
// common case of esbuild + tsc for types
if (fileURLToPath(import.meta.url) === process.argv[1]) {
  await Promise.all([tsc(), esbuild()]);
}
