import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { esbuild } from '../../utils/build.mjs';
import buildEdgeFunctionTemplate from './scripts/build-edge-function-template.js';

const pkgPath = join(process.cwd(), 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const externals = Object.keys(pkg.dependencies || {});

// Compile all `.ts` files individually first,
// so that the template files exist
await esbuild();

await Promise.all([
  buildEdgeFunctionTemplate(),
  esbuild({ bundle: true, external: ['@vercel/build-utils', ...externals] }),
]);
