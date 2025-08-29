import { tsc, esbuild } from '../../utils/build.mjs';

await Promise.all([
  // Type Definitions
  tsc(),

  // CommonJS build (`.js` extension)
  esbuild(),

  // ESM build (`.mjs` extension)
  esbuild({
    format: 'esm',
    outExtension: { '.js': '.mjs' },
  }),
]);
