import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { esbuild, getDependencies } from '../../../utils/build.mjs';
import { compileDevTemplates } from './compile-templates.mjs';

const repoRoot = new URL('../', import.meta.url);

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
await esbuild({
  bundle: true,
  format: 'esm',
  external: getDependencies(),
  banner: {
    // Shim for CommonJS globals in ESM
    js: `
import { createRequire as __createRequire } from 'node:module';
import { fileURLToPath as __fileURLToPath } from 'node:url';
import { dirname as __dirname_ } from 'node:path';
const require = __createRequire(import.meta.url);
const __filename = __fileURLToPath(import.meta.url);
const __dirname = __dirname_(__filename);
`.trim(),
  },
  plugins: [
    // plugin required to handle jsonc-parser
    // https://github.com/evanw/esbuild/issues/1619
    {
      name: 'jsonc-parser-module-first',
      setup(build) {
        build.onResolve({ filter: /^jsonc-parser$/ }, args => {
          const pkgJsonPath = require.resolve('jsonc-parser/package.json', {
            paths: [args.resolveDir],
          });
          const { module, main } = JSON.parse(
            readFileSync(pkgJsonPath, 'utf8')
          );
          const entryRel = module ?? main ?? 'index.js';
          const entryAbs = join(dirname(pkgJsonPath), entryRel);
          return { path: entryAbs, namespace: 'file' };
        });
      },
    },
  ],
});

// Copy a few static files into `dist`
const distRoot = new URL('dist/', repoRoot);
copyFileSync(
  new URL('src/util/projects/VERCEL_DIR_README.txt', repoRoot),
  new URL('VERCEL_DIR_README.txt', distRoot)
);
copyFileSync(
  new URL('src/util/dev/builder-worker.cjs', repoRoot),
  new URL('builder-worker.cjs', distRoot)
);
copyFileSync(
  new URL('src/util/get-latest-version/get-latest-worker.cjs', repoRoot),
  new URL('get-latest-worker.cjs', distRoot)
);
copyFileSync(new URL('src/vc.js', repoRoot), new URL('vc.js', distRoot));
