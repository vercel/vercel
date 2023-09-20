import execa from 'execa';
import { join } from 'node:path';
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { esbuild } from '../../utils/build.mjs';

function createConstants() {
  console.log('Creating `constants.ts`');
  const filename = new URL('src/util/constants.ts', import.meta.url);
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
  if (!value) {
    console.log(`- Constant ${key} is not assigned`);
  }
  return JSON.stringify(value);
}

// Read the secrets from GitHub Actions and generate a file.
// During local development, these secrets will be empty.
createConstants();

// `vercel dev` uses chokidar to watch the filesystem, but opts-out of the
// `fsevents` feature using `useFsEvents: false`, so delete the module here so
// that it is not compiled by ncc, which makes the npm package size larger
// than necessary.
//await remove(join(dirRoot, '../../node_modules/fsevents'));

// Compile the `doT.js` template files for `vercel dev`
console.log();
await execa(process.execPath, ['scripts/compile-templates.js'], {
  stdio: 'inherit',
});

const pkgPath = join(process.cwd(), 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const externals = Object.keys(pkg.dependencies || {});
await esbuild({
  bundle: true,
  external: externals,
});

// `ncc` has some issues with `@vercel/fun`'s runtime files:
//   - Executable bits on the `bootstrap` files appear to be lost:
//       https://github.com/vercel/ncc/pull/182
//   - The `bootstrap.js` asset does not get copied into the output dir:
//       https://github.com/vercel/ncc/issues/278
//
// Aside from those issues, all the same files from the `runtimes` directory
// should be copied into the output runtimes dir, specifically the `index.js`
// files (correctly) do not get copied into the output bundle because they
// get compiled into the final ncc bundle file, however, we want them to be
// present in the npm package because the contents of those files are involved
// with `fun`'s cache invalidation mechanism and they need to be shasum'd.
//const runtimes = join(dirRoot, 'node_modules/@vercel/fun/dist/src/runtimes');
//await cpy('**/*', join(distRoot, 'runtimes'), {
//  parents: true,
//  cwd: runtimes,
//});

// Band-aid to bundle stuff that `ncc` neglects to bundle
const distRoot = new URL('dist/', import.meta.url);
copyFileSync(
  new URL('src/util/projects/VERCEL_DIR_README.txt', import.meta.url),
  new URL('VERCEL_DIR_README.txt', distRoot)
);
copyFileSync(
  new URL('src/util/dev/builder-worker.js', import.meta.url),
  new URL('builder-worker.js', distRoot)
);
copyFileSync(
  new URL('src/util/get-latest-version/get-latest-worker.js', import.meta.url),
  new URL('get-latest-worker.js', distRoot)
);

console.log('Finished building Vercel CLI');
