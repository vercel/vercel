import { join, dirname } from 'node:path';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  copyFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { compileDevTemplates } from './compile-templates.mjs';
import { build as esbuild } from 'esbuild';
import { spawnSync } from 'node:child_process';

const cwd = process.cwd();
const repoRoot = new URL('../', import.meta.url);
const pkg = JSON.parse(readFileSync(new URL('package.json', repoRoot), 'utf8'));

// Create constants file (same as main build)
writeFileSync(
  new URL('src/util/constants.ts', repoRoot),
  `// Auto-generated
export const SENTRY_DSN: string | undefined = ${
    process.env.SENTRY_DSN ? JSON.stringify(process.env.SENTRY_DSN) : undefined
  };\n`,
  'utf8'
);

await compileDevTemplates();

const require = createRequire(import.meta.url);

// Same jsonc-parser plugin as scripts/build.mjs — otherwise the UMD wrapper
// fails at runtime with "Cannot find module './impl/format'"
const jsoncParserPlugin = {
  name: 'jsonc-parser-module-first',
  setup(build) {
    build.onResolve({ filter: /^jsonc-parser$/ }, args => {
      const pkgJsonPath = require.resolve('jsonc-parser/package.json', {
        paths: [args.resolveDir],
      });
      const { module, main } = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
      const entryRel = module ?? main ?? 'index.js';
      const entryAbs = path.join(path.dirname(pkgJsonPath), entryRel);
      return { path: entryAbs, namespace: 'file' };
    });
  },
};

// Replace `child_process` imports with a shim whose `fork()` injects
// BUN_BE_BUN=1, so every fork caller (named or namespace import) lands on
// the patched version.
const childProcessShim = {
  name: 'child-process-shim',
  setup(build) {
    build.onResolve({ filter: /^(node:)?child_process$/ }, args => {
      if (args.pluginData && args.pluginData.shim) return null;
      return { path: args.path, namespace: 'cp-shim' };
    });
    build.onLoad({ filter: /.*/, namespace: 'cp-shim' }, () => ({
      contents: `
        import __cp from 'node:child_process';
        function __patchedFork(modulePath, args, options) {
          const isBunBinary = process.argv[0] === 'bun';
          const env = isBunBinary
            ? { ...process.env, ...(options && options.env), BUN_BE_BUN: '1' }
            : undefined;
          const merged = env ? { ...(options || {}), env } : options;
          return __cp.fork(modulePath, args, merged);
        }
        export const fork = __patchedFork;
        export const spawn = __cp.spawn;
        export const spawnSync = __cp.spawnSync;
        export const exec = __cp.exec;
        export const execSync = __cp.execSync;
        export const execFile = __cp.execFile;
        export const execFileSync = __cp.execFileSync;
        export const ChildProcess = __cp.ChildProcess;
        export default { ...__cp, fork: __patchedFork };
      `,
      loader: 'js',
      pluginData: { shim: true },
      resolveDir: process.cwd(),
    }));
  },
};

// @vercel-internals/get-package-json walks the disk looking for package.json;
// under the binary's virtual FS that loops forever. Return the CLI's own
// package.json, baked in at build time.
const cliPkgJson = JSON.parse(readFileSync(new URL('package.json', repoRoot), 'utf8'));
const getPackageJsonShim = {
  name: 'get-package-json-shim',
  setup(build) {
    build.onResolve({ filter: /^@vercel-internals\/get-package-json$/ }, args => {
      return { path: args.path, namespace: 'get-package-json-shim' };
    });
    build.onLoad({ filter: /.*/, namespace: 'get-package-json-shim' }, () => {
      return {
        contents: `const pkg = ${JSON.stringify(cliPkgJson)};
export function getPackageJSON() { return pkg; }
export default { getPackageJSON };`,
        loader: 'js',
      };
    });
  },
};

// Under the Bun binary `import.meta.url` lives in `/$bunfs/`; redirect
// __dirname / __filename to the on-disk binary location so sidecars shipped
// alongside (dev-server.mjs, builder-worker.cjs, templates) are resolvable.
// Also patches `require('child_process').fork` as a fallback for any caller
// that bypasses the child-process shim.
const banner = {
  js: `
import { createRequire as __createRequire } from 'node:module';
import { fileURLToPath as __fileURLToPath } from 'node:url';
import { dirname as __dirname_ } from 'node:path';
const require = __createRequire(import.meta.url);
const __vc_metaPath = __fileURLToPath(import.meta.url);
const __vc_isBunBinary = __vc_metaPath.includes('/$bunfs/');
const __filename = __vc_isBunBinary ? process.execPath : __vc_metaPath;
const __dirname = __dirname_(__filename);
if (process.env.VC_BINARY_DEBUG) { process.stderr.write('[banner] __dirname=' + __dirname + ' isBunBinary=' + __vc_isBunBinary + '\\n'); }
if (__vc_isBunBinary) {
  const __vc_cp = require('node:child_process');
  const __vc_origFork = __vc_cp.fork;
  __vc_cp.fork = function patchedFork(modulePath, args, options) {
    const env = { ...process.env, ...(options && options.env), BUN_BE_BUN: '1' };
    return __vc_origFork.call(this, modulePath, args, { ...(options || {}), env });
  };
}
`.trim(),
};

const distBinDir = join(cwd, 'dist-bin');
if (!existsSync(distBinDir)) mkdirSync(distBinDir, { recursive: true });

// Bin wrapper: fast path for --version, then dispatch into the bundle.
const wrapperSrc = `
// Auto-generated binary entry wrapper
if (process.argv.length === 3 && (process.argv[2] === '--version' || process.argv[2] === '-v')) {
  console.error('Vercel CLI ${pkg.version}');
  console.log('${pkg.version}');
  process.exit(0);
}
await import('./index-bundled.js');
`.trim();

writeFileSync(join(distBinDir, 'vc-wrapper.mjs'), wrapperSrc, 'utf8');

console.log('[bundle] esbuild: src/index.ts -> dist-bin/index-bundled.js (single file, no splitting)');
const result = await esbuild({
  entryPoints: [join(cwd, 'src/index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  splitting: false,
  outfile: join(distBinDir, 'index-bundled.js'),
  // Optional peers that @mapbox/node-pre-gyp references but we don't use.
  external: [
    'mock-aws-s3',
    'aws-sdk',
    'nock',
    'bufferutil',
    'utf-8-validate',
    'pnpapi',
  ],
  banner,
  plugins: [jsoncParserPlugin, getPackageJsonShim, childProcessShim],
  loader: { '.node': 'copy', '.html': 'text' },
  logLevel: 'warning',
  keepNames: true,
  logOverride: {
    'equals-negative-zero': 'silent',
    'package.json': 'silent',
  },
});

const size = require('node:fs').statSync(join(distBinDir, 'index-bundled.js')).size;
console.log(`[bundle] done. ${(size / 1024 / 1024).toFixed(1)}MB`);

// @vercel/node forks a `dev-server.mjs` sidecar. Bundle a self-contained
// copy alongside the binary so `fork(join(__dirname, 'dev-server.mjs'))`
// resolves at runtime.
console.log('[sidecar] bundling @vercel/node dev-server.mjs...');
await esbuild({
  entryPoints: [
    path.join(
      path.dirname(new URL(import.meta.url).pathname),
      '../../../packages/node/dist/dev-server.mjs'
    ),
  ],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outfile: join(distBinDir, 'dev-server.mjs'),
  external: [
    'mock-aws-s3',
    'aws-sdk',
    'nock',
    'bufferutil',
    'utf-8-validate',
    'pnpapi',
  ],
  banner,
  plugins: [jsoncParserPlugin, childProcessShim],
  loader: { '.node': 'copy', '.html': 'text' },
  logLevel: 'error',
  logOverride: { 'equals-negative-zero': 'silent', 'package.json': 'silent' },
});
const sidecarSize = require('node:fs').statSync(
  join(distBinDir, 'dev-server.mjs')
).size;
console.log(
  `[sidecar] done. ${(sidecarSize / 1024 / 1024).toFixed(1)}MB`
);

// @vercel/node template files, loaded at runtime via readFileSync.
const vercelNodeDist = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  '../../../packages/node/dist'
);
for (const sidecar of ['edge-handler-template.js', 'bundling-handler.js']) {
  const src = path.join(vercelNodeDist, sidecar);
  const dst = join(distBinDir, sidecar);
  if (existsSync(src)) {
    copyFileSync(src, dst);
    console.log(`[sidecar] copied ${sidecar}`);
  }
}

// Forked by dev/builder.ts via `join(__dirname, 'builder-worker.cjs')`.
{
  const src = path.join(
    path.dirname(new URL(import.meta.url).pathname),
    '../src/util/dev/builder-worker.cjs'
  );
  const dst = join(distBinDir, 'builder-worker.cjs');
  if (existsSync(src)) {
    copyFileSync(src, dst);
    console.log('[sidecar] copied builder-worker.cjs');
  }
}

// Now compile with bun
console.log('[compile] bun build --compile ...');
const target = process.env.BUN_TARGET || 'bun-darwin-arm64';
const outfile = process.env.BUN_OUTFILE || join(distBinDir, 'vercel-native');

const bunResult = spawnSync(
  'bun',
  [
    'build',
    '--compile',
    '--target',
    target,
    join(distBinDir, 'vc-wrapper.mjs'),
    '--outfile',
    outfile,
  ],
  { stdio: 'inherit', cwd }
);

if (bunResult.status !== 0) {
  console.error('[compile] bun exited with', bunResult.status);
  process.exit(bunResult.status ?? 1);
}

console.log(`[compile] done -> ${outfile}`);
