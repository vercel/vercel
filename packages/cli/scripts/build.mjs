import { join } from 'node:path';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { esbuild } from '../../../utils/build.mjs';
import { compileDevTemplates } from './compile-templates.mjs';

const repoRoot = new URL('../', import.meta.url);

function createConstants() {
  const filename = new URL('src/util/constants.ts', repoRoot);
  const contents = `// This file is auto-generated
export const GA_TRACKING_ID: string | undefined = ${envToString(
    'GA_TRACKING_ID'
  )};
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

const pkgPath = join(process.cwd(), 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const externals = Object.keys(pkg.dependencies || {});
await esbuild({
  bundle: true,
  external: externals,
});

// Copy a few static files into `dist`
const distRoot = new URL('dist/', repoRoot);
copyFileSync(
  new URL('src/util/projects/VERCEL_DIR_README.txt', repoRoot),
  new URL('VERCEL_DIR_README.txt', distRoot)
);
copyFileSync(
  new URL('src/util/dev/builder-worker.js', repoRoot),
  new URL('builder-worker.js', distRoot)
);
copyFileSync(
  new URL('src/util/get-latest-version/get-latest-worker.js', repoRoot),
  new URL('get-latest-worker.js', distRoot)
);
