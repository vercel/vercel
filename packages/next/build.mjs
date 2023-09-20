import { join } from 'node:path';
import { readFileSync, unlinkSync } from 'node:fs';
import { esbuild } from '../../utils/build.mjs';
import buildEdgeFunctionTemplate from './scripts/build-edge-function-template.js';

const pkgPath = join(process.cwd(), 'package.json');
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
const externals = Object.keys(pkg.dependencies || {});

await Promise.all([
  // Compile all launcher `.ts` files into the "dist" dir
  esbuild({
    entryPoints: [
      'src/legacy-launcher.ts',
      'src/server-launcher.ts',
      'src/templated-launcher-shared.ts',
      'src/templated-launcher.ts',
    ],
  }),
  buildEdgeFunctionTemplate(),
]);

await esbuild({ bundle: true, external: ['@vercel/build-utils', ...externals] });

// The file from `buildEdgeFunctionTemplate()` has been bundled,
// and is no longer needed, so clean it up
unlinkSync(new URL('dist/___get-nextjs-edge-function.js', import.meta.url));
