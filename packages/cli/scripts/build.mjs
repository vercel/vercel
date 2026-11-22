import { join } from 'node:path';
import {
  copyFileSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { compileDevTemplates } from './compile-templates.mjs';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build as esbuildBuild } from 'esbuild';
import path from 'node:path';
import { esbuild, getDependencies } from '../../../utils/build.mjs';
import { createConfigValidatorPlugin } from './precompile-config-validator.mjs';
import { createBundledSkillsPlugin } from './bundle-skills.mjs';

const repoRoot = new URL('../', import.meta.url);
const cwd = process.cwd();
const pkg = JSON.parse(readFileSync(new URL('package.json', repoRoot), 'utf8'));
const runtimeAssetManifest = JSON.parse(
  readFileSync(new URL('src/runtime-assets/manifest.json', repoRoot), 'utf8')
);

// Priority commands get their own entry points for fast loading
// This list needs to be fairly short and targeted -- we can't add everything
// or we lose the benefit of tree shaking & keeping the number of chunks in the
// bundle relatively small. This list is informed by our telemetry (what end users
// use) but also by the fast that some of these commands have heavy dependencies that
// are unique to them (like 'dev'.) So don't grow this list mindlessly, benchmark.
const PRIORITY_COMMANDS = [
  'deploy',
  'env',
  'list',
  'link',
  'build',
  'dev',
  'project',
];

// Every other command loads from one of these groups (src/commands-<group>.ts),
// so a command only loads the code of the commands it shares a group with.
// Commands are grouped by the code they share: one chunk per command splits
// shared code into so many files that startup and the priority commands get
// slower, and a single group makes every command load all of them. Add a new
// command to the group whose commands it shares the most code with, or to
// `core` if it's small.
const COMMAND_GROUPS = [
  'core',
  'account',
  'ai',
  'blob',
  'deployments',
  'flags',
  'integrations',
  'observability',
  'routing',
];

function createConstants() {
  const filename = new URL('src/util/constants.ts', repoRoot);
  const contents = `// This file is auto-generated
export const SENTRY_DSN: string | undefined = ${envToString('SENTRY_DSN')};
export const BUILD_LABEL: string | undefined = ${envToString(
    'VERCEL_CLI_BUILD_LABEL'
  )};
`;
  writeFileSync(filename, contents, 'utf8');
}

function envToString(key) {
  const value = process.env[key];
  if (value) {
    return JSON.stringify(value);
  }
}

// Read the secrets from GitHub Actions and generate a file.
// During local development, these secrets will be empty.
createConstants();

// Validate that index.ts doesn't use require() for command loading.
// Commands must use `await import('./commands-<group>.js')` for code splitting.
{
  const indexSrc = readFileSync(new URL('src/index.ts', repoRoot), 'utf8');
  const badRequires = indexSrc.match(/require\(['"]\.\/commands\//g);
  if (badRequires) {
    console.error(
      `\nError: src/index.ts uses require() to load commands (${badRequires.length} occurrence(s)).` +
        `\nCommands must be loaded via: (await import('./commands-<group>.js')).<name>` +
        `\nWe use this pattern for more efficient code splitting and minimizing the startup time of the CLI.\n`
    );
    process.exit(1);
  }
}

// Compile the `doT.js` template files for `vercel dev`
await compileDevTemplates();

const require = createRequire(import.meta.url);

// CommonJS shim for ESM output
const banner = {
  js: `
import { createRequire as __createRequire } from 'node:module';
import { fileURLToPath as __fileURLToPath } from 'node:url';
import { dirname as __dirname_ } from 'node:path';
const require = __createRequire(import.meta.url);
const __filename = __fileURLToPath(import.meta.url);
const __dirname = __dirname_(__filename);
`.trim(),
};

// Plugin to handle jsonc-parser
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

// Build entry points:
// - src/index.ts (main entry)
// - src/help.ts (standalone help for fast --help)
// - src/internal-build-worker.ts (native build prewarm handoff)
// - src/internal-build.ts (`vc build` for the native build prewarm handoff)
// - src/native-download.ts (dist/vc.js downloads a missing native binary)
// - src/commands-<group>.ts (non-priority command groups)
// - src/commands/[priority]/index.ts (priority command entry points)
const entryPoints = [
  join(cwd, 'src/index.ts'),
  join(cwd, 'src/help.ts'),
  join(cwd, 'src/internal-build-worker.ts'),
  join(cwd, 'src/internal-build.ts'),
  join(cwd, 'src/native-download.ts'),
  ...COMMAND_GROUPS.map(group => join(cwd, `src/commands-${group}.ts`)),
  ...PRIORITY_COMMANDS.map(cmd => join(cwd, `src/commands/${cmd}/index.ts`)),
];

const distDir = join(cwd, 'dist');
const binaryOnlyDependencies = [
  '@vltpkg/graph',
  '@vltpkg/package-info',
  '@vltpkg/package-json',
  'path-scurry',
];

// Runtime dependencies are external by default, so each one loads from
// node_modules file by file. These are bundled instead: they are pure
// JavaScript, and loading them unbundled cost hundreds of files per command
// (jose, zod and undici alone are over 400), which is slow in the native
// binary's virtual filesystem.
const bundledDependencies = new Set([
  '@vercel/blob',
  '@vercel/prepare-flags-definitions',
  'jose',
  'luxon',
  'smol-toml',
  'undici',
  'uuid',
  'zod',
]);

// esbuild writes hashed chunks but does not remove stale files from previous
// builds. Clean the output directory first so package/binary artifacts only
// include files referenced by the current build.
rmSync(distDir, { recursive: true, force: true });

// Ensure commands output directories exist
for (const cmd of PRIORITY_COMMANDS) {
  const cmdDistDir = join(distDir, 'commands', cmd);
  if (!existsSync(cmdDistDir)) {
    mkdirSync(cmdDistDir, { recursive: true });
  }
}

await esbuild({
  entryPoints,
  bundle: true,
  format: 'esm',
  // Match the minimum supported runtime instead of lowering modern syntax
  // to the repository-wide ES2021 target.
  target: 'node20',
  minifySyntax: true,
  minifyWhitespace: true,
  splitting: true,
  chunkNames: 'chunks/[name]-[hash]',
  outdir: distDir,
  external: [
    ...getDependencies().filter(name => !bundledDependencies.has(name)),
    ...binaryOnlyDependencies,
  ],
  banner,
  plugins: [
    {
      // These packages are CommonJS. Using require preserves their shared
      // module identity and avoids Node's costly ESM named-export scan.
      name: 'cjs-dependencies',
      setup(build) {
        build.onResolve(
          { filter: /^@vercel\/(build-utils|cli-config)$/ },
          args => {
            if (args.kind === 'import-statement')
              return { path: args.path, namespace: 'cjs-dependency' };
          }
        );
        build.onLoad({ filter: /.*/, namespace: 'cjs-dependency' }, args => ({
          contents: `module.exports = require(${JSON.stringify(args.path)});`,
          resolveDir: cwd,
        }));
      },
    },
    jsoncParserPlugin,
    await createConfigValidatorPlugin(),
    await createBundledSkillsPlugin(),
  ],
});

// Move priority command outputs to expected locations
// esbuild outputs them as dist/[name].js, we need dist/commands/[name]/index.js
for (const cmd of PRIORITY_COMMANDS) {
  const srcPath = join(distDir, `${cmd}.js`);
  const destDir = join(distDir, 'commands', cmd);
  const destPath = join(destDir, 'index.js');

  if (existsSync(srcPath)) {
    if (!existsSync(destDir)) {
      mkdirSync(destDir, { recursive: true });
    }
    // Read, adjust paths, write
    let content = readFileSync(srcPath, 'utf8');
    // Fix chunk import paths (from ./chunks/ to ../../chunks/)
    content = content.replace(/(from\s*)"\.\/chunks\//g, '$1"../../chunks/');
    content = content.replace(
      /import\("\.\/chunks\//g,
      'import("../../chunks/'
    );
    writeFileSync(destPath, content, 'utf8');
  }
}

// Copy a few static files into `dist`
const distRoot = new URL('dist/', repoRoot);
// builder-worker.cjs goes next to the dev entry point, since code splitting
// places it at dist/commands/dev/ and the code uses join(__dirname, ...) to find it.
copyFileSync(
  new URL('src/util/dev/builder-worker.cjs', repoRoot),
  new URL('commands/dev/builder-worker.cjs', distRoot)
);
// The `vc build` builder worker is bundled into dist/commands/build/index.js, so its
// join(__dirname, 'builder-worker.cjs') resolves next to that entry.
copyFileSync(
  new URL('src/util/build/builder-worker.cjs', repoRoot),
  new URL('commands/build/builder-worker.cjs', distRoot)
);
for (const [id, asset] of Object.entries(runtimeAssetManifest)) {
  for (const field of ['source', 'destination']) {
    const value = asset[field];
    if (
      typeof value !== 'string' ||
      value === '' ||
      path.isAbsolute(value) ||
      value.split(/[\\/]/).includes('..')
    ) {
      throw new Error(
        `Runtime asset "${id}" has an invalid ${field} path: ${JSON.stringify(value)}`
      );
    }
  }

  const source = new URL(`src/runtime-assets/${asset.source}`, repoRoot);
  const destination = new URL(`runtime-assets/${asset.destination}`, distRoot);
  mkdirSync(new URL('./', destination), { recursive: true });
  copyFileSync(source, destination);
}
copyFileSync(
  new URL('src/util/get-latest-version/get-latest-worker.cjs', repoRoot),
  new URL('get-latest-worker.cjs', distRoot)
);
copyFileSync(
  new URL('src/util/get-latest-version/fetch-dist-tags.cjs', repoRoot),
  new URL('fetch-dist-tags.cjs', distRoot)
);
copyFileSync(new URL('src/vc.js', repoRoot), new URL('vc.js', distRoot));

// Generate root-help-commands.mjs for fast --help lookup. It lists the
// registered commands, so the root help page stays in sync with the command
// tree without loading it at runtime.
{
  const script = fileURLToPath(new URL('.root-help-commands.cjs', distRoot));
  await esbuildBuild({
    stdin: {
      contents: [
        "import { commandsStructs } from './src/commands';",
        "import { getRootHelpCommands } from './src/commands/root-help';",
        'process.stdout.write(JSON.stringify(getRootHelpCommands(commandsStructs)));',
      ].join('\n'),
      resolveDir: fileURLToPath(repoRoot),
      loader: 'ts',
    },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
    outfile: script,
    logLevel: 'error',
  });
  try {
    const rootHelpCommands = execFileSync(process.execPath, [script], {
      encoding: 'utf8',
    });
    writeFileSync(
      new URL('root-help-commands.mjs', distRoot),
      `export const rootHelpCommands = ${rootHelpCommands};\n`
    );
  } finally {
    rmSync(script, { force: true });
  }
}

// Generate version.mjs for fast --version lookup. VERCEL_CLI_BUILD_LABEL is
// stamped by CI for non-release builds (e.g. "pr-115 abc1234") and shown in
// the `vc --version` banner.
const buildLabel = process.env.VERCEL_CLI_BUILD_LABEL || '';
writeFileSync(
  new URL('version.mjs', distRoot),
  `export const version = ${JSON.stringify(pkg.version)};\n` +
    `export const buildLabel = ${JSON.stringify(buildLabel)};\n`
);
