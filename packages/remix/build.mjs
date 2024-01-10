import { buildBuilder } from '../../utils/build-builder.mjs';

await Promise.all([
  buildBuilder(),
  buildBuilder({
    format: 'esm',
    entryPoints: ['src/vite-plugin-config.ts'],
    outfile: 'dist/vite-plugin-config.mjs',
  }),
]);
