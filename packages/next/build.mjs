import { readFileSync, promises as fsPromises } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

import { esbuild } from '../../utils/build.mjs';
import buildEdgeFunctionTemplate from './scripts/build-edge-function-template.js';

const require = createRequire(import.meta.url);

const { copyFile } = fsPromises;

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

// The bundled version of source-map looks for the wasm mappings file as a sibling.
await copyFile(
  require.resolve('source-map/lib/mappings.wasm'),
  join(process.cwd(), 'dist/mappings.wasm')
);

await esbuild({
  bundle: true,
  external: ['@vercel/build-utils', ...externals],
});
