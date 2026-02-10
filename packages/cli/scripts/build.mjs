import { join } from 'node:path';
import {
  copyFileSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
} from 'node:fs';
import { compileDevTemplates } from './compile-templates.mjs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { esbuild, getDependencies } from '../../../utils/build.mjs';

const repoRoot = new URL('../', import.meta.url);
const cwd = process.cwd();
const pkg = JSON.parse(readFileSync(new URL('package.json', repoRoot), 'utf8'));

// Priority commands get their own entry points for fast loading
// This list needs to be fairly short and targeted -- we can't add everything
// or we lose the benefit of tree shaking & keeping the number of chunks in the
// bundle relatively small. This list is informed by our telemetry (what end users
// use) but also by the fast that some of these commands have heavy dependencies that
// are unique to them (like 'dev'.) So don't grow this list mindlessly, benchmark.
const PRIORITY_COMMANDS = ['deploy', 'env', 'list', 'link', 'build', 'dev'];

function createConstants() {
  const filename = new URL('src/util/constants.ts', repoRoot);
  const contents = `// This file is auto-generated
export const SENTRY_DSN: string | undefined = ${envToString('SENTRY_DSN')};
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
// - src/commands-bulk.ts (non-priority commands bundle)
// - src/commands/[priority]/index.ts (priority command entry points)
const entryPoints = [
  join(cwd, 'src/index.ts'),
  join(cwd, 'src/help.ts'),
  join(cwd, 'src/commands-bulk.ts'),
  ...PRIORITY_COMMANDS.map(cmd => join(cwd, `src/commands/${cmd}/index.ts`)),
];

const distDir = join(cwd, 'dist');

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
  splitting: true,
  chunkNames: 'chunks/[name]-[hash]',
  outdir: distDir,
  external: getDependencies(),
  banner,
  plugins: [jsoncParserPlugin],
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
    content = content.replace(/from "\.\/chunks\//g, 'from "../../chunks/');
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
copyFileSync(
  new URL('src/util/get-latest-version/get-latest-worker.cjs', repoRoot),
  new URL('get-latest-worker.cjs', distRoot)
);
copyFileSync(new URL('src/vc.js', repoRoot), new URL('vc.js', distRoot));

// Generate version.mjs for fast --version lookup
writeFileSync(
  new URL('version.mjs', distRoot),
  `export const version = ${JSON.stringify(pkg.version)};\n`
);
