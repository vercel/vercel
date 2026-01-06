import { esbuild, tsc } from '../../utils/build.mjs';

// Bundle daemon into a single file for easy distribution
await Promise.all([
  tsc(),
  esbuild({
    bundle: true,
    outfile: 'dist/index.js',
    external: [],  // Bundle all dependencies
  }),
]);
