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

// Polyfill: @vercel-internals/get-package-json does a stack-trace-based
// walk-up to find package.json. In Bun's compiled binary virtual FS there
// is no package.json anywhere, so the walk infinite-loops. Replace it with
// a module that returns the CLI package.json baked in at build time.
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

// Under Bun's compiled binary, import.meta.url resolves to /$bunfs/root/...
// (the virtual FS). Sidecar files shipped next to the binary (dev-server.mjs,
// edge-handler-template.js, etc.) live at `dirname(process.execPath)`. Detect
// the compiled-binary case and redirect __dirname / __filename to the real
// on-disk binary location so bundled builders find their sidecars.
const banner = {
  js: `
import { createRequire as __createRequire } from 'node:module';
import { fileURLToPath as __fileURLToPath } from 'node:url';
import { dirname as __dirname_ } from 'node:path';
const require = __createRequire(import.meta.url);
const __vc_metaPath = __fileURLToPath(import.meta.url);
const __vc_isBunBinary = __vc_metaPath.startsWith('/$bunfs/') || __vc_metaPath.includes('/$bunfs/');
const __filename = __vc_isBunBinary ? process.execPath : __vc_metaPath;
const __dirname = __dirname_(__filename);
if (process.env.VC_BINARY_DEBUG) { process.stderr.write('[banner] __dirname=' + __dirname + ' isBunBinary=' + __vc_isBunBinary + '\\n'); }
`.trim(),
};

const distBinDir = join(cwd, 'dist-bin');
if (!existsSync(distBinDir)) mkdirSync(distBinDir, { recursive: true });

// Write the bin wrapper: fast paths for --version / --help, then dispatch.
// This mirrors src/vc.js but with a statically-known version (no version.mjs import).
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
  // Bundle everything except optional deps that @mapbox/node-pre-gyp references
  // but we don't actually use (they get tree-shaken at runtime via dynamic require)
  external: [
    'mock-aws-s3',
    'aws-sdk',
    'nock',
    'bufferutil',
    'utf-8-validate',
    'pnpapi',
  ],
  banner,
  plugins: [jsoncParserPlugin, getPackageJsonShim],
  loader: { '.node': 'copy', '.html': 'text' },
  logLevel: 'warning',
  // Keep names so stack traces are useful
  keepNames: true,
  logOverride: {
    'equals-negative-zero': 'silent',
    'package.json': 'silent',
  },
});

const size = require('node:fs').statSync(join(distBinDir, 'index-bundled.js')).size;
console.log(`[bundle] done. ${(size / 1024 / 1024).toFixed(1)}MB`);

// @vercel/node ships a sidecar `dev-server.mjs` that it forks for function
// invocation. When @vercel/node is bundled into our CLI, __dirname resolution
// points to our dist-bin/ rather than @vercel/node's own dist/, and the sidecar
// is missing. Bundle it as a self-contained file next to our CLI bundle so
// `fork(join(__dirname, 'dev-server.mjs'))` from inside the bundled builder
// finds a working sidecar with all its deps inlined.
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
  plugins: [jsoncParserPlugin],
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

// Copy @vercel/node's remaining sidecars (templates loaded via readFileSync).
// These are small files, loaded via `join(__dirname, filename)` from inside
// the bundled builder.
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
