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
// under the binary's virtual FS that loops forever. Hardcode the response to
// the CLI's own package.json, baked in at build time. This shim only serves
// the CLI package — it is not a general-purpose lookup.
const cliPkgJson = JSON.parse(readFileSync(new URL('package.json', repoRoot), 'utf8'));
const cliPackageJsonShim = {
  name: 'cli-package-json-shim',
  setup(build) {
    build.onResolve({ filter: /^@vercel-internals\/get-package-json$/ }, args => {
      return { path: args.path, namespace: 'cli-package-json-shim' };
    });
    build.onLoad({ filter: /.*/, namespace: 'cli-package-json-shim' }, () => {
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
const __vc_isBunBinary = __vc_metaPath.includes('/$bunfs/') || __vc_metaPath.includes('B:/~BUN/');
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
  plugins: [jsoncParserPlugin, cliPackageJsonShim, childProcessShim],
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

// Supported Bun compile targets. `os` matches process.platform values
// (darwin/linux/win32). `abi: 'musl'` is for statically-linked Linux
// binaries that run on Alpine and other musl-based distros.
//
// Windows is intentionally disabled: our fork-of-self pattern (forking
// dev-server.mjs / builder-worker.cjs and patching child_process.fork to
// inject BUN_BE_BUN=1) has not been validated on Windows. Re-enable once
// `vc dev` is verified end-to-end on a real Windows host and the bunfs
// path detector is updated to also match `B:/~BUN/` (Bun's Windows VFS).
const allTargets = [
  { os: 'darwin', arch: 'arm64' },
  { os: 'darwin', arch: 'x64' },
  { os: 'linux', arch: 'arm64' },
  { os: 'linux', arch: 'x64' },
  { os: 'linux', arch: 'arm64', abi: 'musl' },
  { os: 'linux', arch: 'x64', abi: 'musl' },
  // { os: 'win32', arch: 'arm64' },
  // { os: 'win32', arch: 'x64' },
];

// Bun's --target uses "windows" rather than the Node "win32".
const bunTargetOf = t =>
  `bun-${t.os === 'win32' ? 'windows' : t.os}-${t.arch}${t.abi ? `-${t.abi}` : ''}`;
const assetNameOf = t => {
  const os = t.os === 'win32' ? 'windows' : t.os;
  const abi = t.abi ? `-${t.abi}` : '';
  const ext = t.os === 'win32' ? '.exe' : '';
  return `vercel-${os}-${t.arch}${abi}${ext}`;
};

// Target selection priority:
//   1. BUN_TARGET env (CI sets this per matrix runner)
//   2. --all flag (cross-compile every target; used for release bundles)
//   3. default: current platform only (fastest local iteration)
const buildAll = process.argv.slice(2).includes('--all');
let targets;
if (process.env.BUN_TARGET) {
  // Parse anything matching `bun-<os>-<arch>[-<abi>]`. We don't gate on
  // `allTargets` here so validate-only workflows can build experimental
  // targets (e.g. Windows) without flipping them on for everyone via --all.
  const m = /^bun-(darwin|linux|windows)-(arm64|x64)(?:-(musl))?$/.exec(
    process.env.BUN_TARGET
  );
  if (!m) {
    console.error(`[compile] invalid BUN_TARGET: ${process.env.BUN_TARGET}`);
    console.error(
      `[compile] expected: bun-(darwin|linux|windows)-(arm64|x64)[-musl]`
    );
    process.exit(1);
  }
  const os = m[1] === 'windows' ? 'win32' : m[1];
  const t = { os, arch: m[2] };
  if (m[3]) t.abi = m[3];
  targets = [t];
} else if (buildAll) {
  targets = allTargets;
} else {
  // Default to glibc Linux (no abi) on the host — musl users opt in via --all
  // or BUN_TARGET. We can't detect glibc vs musl reliably from Node.
  const current = allTargets.find(
    t => t.os === process.platform && t.arch === process.arch && !t.abi
  );
  if (!current) {
    console.error(
      `[compile] no supported target for ${process.platform}/${process.arch}`
    );
    console.error(
      `[compile] supported: ${allTargets.map(bunTargetOf).join(', ')}`
    );
    console.error(`[compile] pass --all to cross-compile every target`);
    process.exit(1);
  }
  targets = [current];
}

console.log(
  `[compile] building ${targets.length} target${targets.length > 1 ? 's' : ''}: ${targets
    .map(assetNameOf)
    .join(', ')}`
);

for (const t of targets) {
  const bunTarget = bunTargetOf(t);
  const outfile = join(distBinDir, assetNameOf(t));

  console.log(`[compile] ${bunTarget} -> ${outfile}`);
  const bunResult = spawnSync(
    'bun',
    [
      'build',
      '--compile',
      '--target',
      bunTarget,
      join(distBinDir, 'vc-wrapper.mjs'),
      '--outfile',
      outfile,
    ],
    { stdio: 'inherit', cwd }
  );

  if (bunResult.status !== 0) {
    console.error(`[compile] bun failed for ${bunTarget}`);
    process.exit(bunResult.status ?? 1);
  }

  // Smoke-test only when output matches the host; can't exec cross-compiled
  // binaries, and musl binaries won't run on glibc hosts.
  const hostMatches =
    t.os === process.platform && t.arch === process.arch && !t.abi;
  if (hostMatches) {
    const smoke = spawnSync(outfile, ['--version'], {
      stdio: 'pipe',
      encoding: 'utf8',
    });
    if (smoke.status !== 0) {
      console.error(`[smoke] ${outfile} --version failed`);
      console.error(smoke.stderr || smoke.stdout);
      process.exit(1);
    }
    console.log(
      `[smoke] ok: ${(smoke.stdout || smoke.stderr || '').trim().split('\n')[0]}`
    );
  }
}
