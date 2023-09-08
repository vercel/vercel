/**
 * This script is the build configuration common to all our Builder packages.
 * We bundle the output using `esbuild`, and do not publish type definitions.
 *
 * `@vercel/build-utils` is marked as external because it's always an implicit
 * dependency when the Builder is invoked by `vercel build`.
 */
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { esbuild } from './build.mjs';

const pkgPath = join(process.cwd(), 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

const externals = Object.keys(pkg.dependencies || {});

await esbuild({
  bundle: true,
  external: ['@vercel/build-utils', ...externals],
});
