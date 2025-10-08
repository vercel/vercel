import { join } from 'node:path';
import { readFileSync, copyFileSync } from 'node:fs';
import { esbuild } from '../../utils/build.mjs';

const pkgPath = join(process.cwd(), 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const externals = Object.keys(pkg.dependencies || {});

await Promise.all([
  esbuild({
    bundle: true,
    external: ['@vercel/build-utils', ...externals],
  }),
  esbuild({
    entryPoints: ['src/dev-server.mts'],
    outfile: 'dist/dev-server.mjs',
    format: 'esm',
    bundle: true,
    external: ['@vercel/build-utils', ...externals],
  }),
]);

// Copy public type definitions
const srcTypesFile = new URL('src/types.d.ts', import.meta.url);
const distTypesFile = new URL('dist/index.d.ts', import.meta.url);
copyFileSync(srcTypesFile, distTypesFile);

if (process.env.CI) {
  // Copy type file for ts test
  copyFileSync(
    distTypesFile,
    new URL('test/fixtures/15-helpers/ts/types.d.ts', import.meta.url)
  );
}

copyFileSync(
  new URL('src/edge-functions/edge-handler-template.js', import.meta.url),
  new URL('dist/edge-handler-template.js', import.meta.url)
);
