import { join } from 'node:path';
import { copyFileSync, readFileSync } from 'node:fs';
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
      'src/templated-launcher-shared.ts',
      'src/templated-launcher.ts',
    ],
  }),
  buildEdgeFunctionTemplate(),
]);

// Copy the launcher `.mjs` file into the "dist" dir
copyFileSync('src/server-launcher.mjs', 'dist/server-launcher.mjs');

await esbuild({
  bundle: true,
  external: ['@vercel/build-utils', ...externals],
});
