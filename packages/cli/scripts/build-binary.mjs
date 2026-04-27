import { join } from 'node:path';
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  copyFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { compileDevTemplates } from './compile-templates.mjs';
import { build as esbuild } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const cwd = process.cwd();
const repoRoot = new URL('../', import.meta.url);
const pkg = JSON.parse(readFileSync(new URL('package.json', repoRoot), 'utf8'));

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

// Ensure forked dev workers run under Bun when launched from a Bun binary.
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

const cliPkgJson = JSON.parse(
  readFileSync(new URL('package.json', repoRoot), 'utf8')
);
const cliPackageJsonShim = {
  name: 'cli-package-json-shim',
  setup(build) {
    build.onResolve(
      { filter: /^@vercel-internals\/get-package-json$/ },
      args => {
        return { path: args.path, namespace: 'cli-package-json-shim' };
      }
    );
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

const banner = {
  js: `
import { createRequire as __createRequire } from 'node:module';
import { fileURLToPath as __fileURLToPath } from 'node:url';
import { dirname as __dirname_ } from 'node:path';
const require = __createRequire(import.meta.url);
// Detect against import.meta.url (always forward-slash) — fileURLToPath gives
// backslashes on Windows, which would otherwise break the B:/~BUN/ check.
const __vc_isBunBinary = import.meta.url.includes('/$bunfs/') || import.meta.url.includes('B:/~BUN/');
const __vc_metaPath = __fileURLToPath(import.meta.url);
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

console.log(
  '[bundle] esbuild: src/index.ts -> dist-bin/index-bundled.js (single file, no splitting)'
);
await esbuild({
  entryPoints: [join(cwd, 'src/index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  splitting: false,
  outfile: join(distBinDir, 'index-bundled.js'),
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

const size = require('node:fs').statSync(
  join(distBinDir, 'index-bundled.js')
).size;
console.log(`[bundle] done. ${(size / 1024 / 1024).toFixed(1)}MB`);

// @vercel/node forks a `dev-server.mjs` sidecar. Bundle a self-contained
// copy and embed it into the compiled wrapper so it can be extracted to a
// real filesystem path at runtime.
console.log('[sidecar] bundling @vercel/node dev-server.mjs...');
await esbuild({
  entryPoints: [
    path.join(
      path.dirname(fileURLToPath(import.meta.url)),
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
console.log(`[sidecar] done. ${(sidecarSize / 1024 / 1024).toFixed(1)}MB`);

const vercelNodeDist = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
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

{
  const src = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../src/util/dev/builder-worker.cjs'
  );
  const dst = join(distBinDir, 'builder-worker.cjs');
  if (existsSync(src)) {
    copyFileSync(src, dst);
    console.log('[sidecar] copied builder-worker.cjs');
  }
}

const sidecarAssets = [
  'dev-server.mjs',
  'edge-handler-template.js',
  'bundling-handler.js',
  'builder-worker.cjs',
]
  .filter(filename => existsSync(join(distBinDir, filename)))
  .map(filename => ({
    filename,
    contents: readFileSync(join(distBinDir, filename), 'utf8'),
  }));
const sidecarAssetsDigest = createHash('sha256')
  .update(JSON.stringify(sidecarAssets))
  .digest('hex')
  .slice(0, 16);

writeFileSync(
  join(distBinDir, 'vc-sidecar-assets.mjs'),
  `// Auto-generated binary sidecar assets\nexport const sidecarAssets = ${JSON.stringify(
    sidecarAssets
  )};\n`,
  'utf8'
);

// Bin wrapper: fast path for --version, then extract sidecars and dispatch
// into the bundle. On Windows, Bun's compiled runtime can report __dirname as
// B:\\~BUN\\root, so dev-time fork targets must be written to a real path.
const wrapperSrc = `
// Auto-generated binary entry wrapper
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sidecarAssets } from './vc-sidecar-assets.mjs';

if (process.argv.length === 3 && (process.argv[2] === '--version' || process.argv[2] === '-v')) {
  console.error('Vercel CLI ${pkg.version}');
  console.log('${pkg.version}');
  process.exit(0);
}

const sidecarDir = join(
  tmpdir(),
  'vercel-cli-binary-${pkg.version}-${sidecarAssetsDigest}'
);
mkdirSync(sidecarDir, { recursive: true });
for (const asset of sidecarAssets) {
  const file = join(sidecarDir, asset.filename);
  if (!existsSync(file) || readFileSync(file, 'utf8') !== asset.contents) {
    writeFileSync(file, asset.contents, 'utf8');
  }
}

process.env.VERCEL_CLI_BINARY_ASSET_DIR = sidecarDir;
process.env.VERCEL_CLI_BINARY_DEV_SERVER_PATH = join(sidecarDir, 'dev-server.mjs');
process.env.VERCEL_CLI_BINARY_BUILDER_WORKER_PATH = join(sidecarDir, 'builder-worker.cjs');
process.env.VERCEL_NODE_BUNDLING_HANDLER_PATH = join(sidecarDir, 'bundling-handler.js');
process.env.VERCEL_NODE_EDGE_HANDLER_TEMPLATE_PATH = join(sidecarDir, 'edge-handler-template.js');

await import('./index-bundled.js');
`.trim();

writeFileSync(join(distBinDir, 'vc-wrapper.mjs'), wrapperSrc, 'utf8');

const allTargets = [
  { os: 'darwin', arch: 'arm64' },
  { os: 'darwin', arch: 'x64' },
  { os: 'linux', arch: 'arm64' },
  { os: 'linux', arch: 'x64' },
  { os: 'linux', arch: 'arm64', abi: 'musl' },
  { os: 'linux', arch: 'x64', abi: 'musl' },
  { os: 'win32', arch: 'arm64' },
  { os: 'win32', arch: 'x64' },
];

const bunTargetOf = t =>
  `bun-${t.os === 'win32' ? 'windows' : t.os}-${t.arch}${t.abi ? `-${t.abi}` : ''}`;
const assetNameOf = t => {
  const os = t.os === 'win32' ? 'windows' : t.os;
  const abi = t.abi ? `-${t.abi}` : '';
  const ext = t.os === 'win32' ? '.exe' : '';
  return `vercel-${os}-${t.arch}${abi}${ext}`;
};

const buildAll = process.argv.slice(2).includes('--all');
let targets;
if (process.env.BUN_TARGET) {
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
