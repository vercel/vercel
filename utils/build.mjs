import execa from 'execa';
import ts from 'typescript';
import path from 'node:path';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

// Resolve the userland punycode npm package path from the pnpm store.
// This is used to avoid the Node.js DEP0040 deprecation warning that fires
// when old packages (tr46@0.0.3, whatwg-url@5.x) use require("punycode")
// — the deprecated built-in — which gets bundled by esbuild.
// By redirecting to the userland npm package, the code is inlined and no
// runtime require("punycode") call reaches Node.js.
function findUserlandPunycode() {
  const pnpmDir = fileURLToPath(
    new URL('../node_modules/.pnpm', import.meta.url)
  );
  if (!existsSync(pnpmDir)) return null;
  let dirs;
  try {
    dirs = readdirSync(pnpmDir).filter(d => /^punycode@\d/.test(d));
  } catch {
    return null;
  }
  // Sort descending by version to prefer the highest version
  dirs.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  for (const dir of dirs) {
    const main = `${pnpmDir}/${dir}/node_modules/punycode/punycode.js`;
    if (existsSync(main)) return main;
  }
  return null;
}

/** @type {string | null} */
const _userlandPunycodePath = findUserlandPunycode();

/**
 * esbuild plugin: resolve require("punycode") to the userland npm package
 * (punycode@2.x) to avoid Node.js DEP0040 DeprecationWarning in Node 22+.
 * Only active when bundling (bundle: true) and the package is found.
 *
 * @type {import('esbuild').Plugin}
 */
const punycodeUserlandPlugin = {
  name: 'punycode-userland',
  setup(build) {
    if (!_userlandPunycodePath) return;
    build.onResolve({ filter: /^punycode$/ }, () => ({
      path: _userlandPunycodePath,
    }));
  },
};

export function getDependencies(cwd = process.cwd()) {
  const pkgPath = path.join(cwd, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  return Object.keys(pkg.dependencies || {});
}

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

  const entryPoints =
    opts.entryPoints ??
    (opts.bundle
      ? // When bundling, assume `src/index.ts` is the entrypoint file
        [path.join(cwd, 'src/index.ts')]
      : // When not bundling, compile all files referenced by the `tsconfig.json` file
        tsconfig.fileNames);

  let outdir = opts.outfile ? undefined : tsconfig.options.outDir;

  // Merge the punycode plugin only when bundling to avoid DEP0040 warnings
  const plugins = [
    ...(opts.bundle ? [punycodeUserlandPlugin] : []),
    ...(opts.plugins ?? []),
  ];

  await build({
    entryPoints,
    format: 'cjs',
    outdir,
    platform: 'node',
    target: ts.ScriptTarget[tsconfig.options.target],
    sourcemap: tsconfig.options.sourceMap,
    ...opts,
    plugins,
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
