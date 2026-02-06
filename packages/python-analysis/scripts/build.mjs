import { esbuild, getDependencies, tsc } from '../../../utils/build.mjs';

const externals = getDependencies();

await Promise.all([
  tsc(),
  // ESM build
  esbuild({
    bundle: true,
    format: 'esm',
    external: [...externals, '#wasm/*'],
  }),
  // CJS build
  esbuild({
    bundle: true,
    format: 'cjs',
    outfile: 'dist/index.cjs',
    external: [...externals, '#wasm/*'],
    // Polyfill for import.meta.url
    define: {
      'import.meta.url': '__import_meta_url__',
    },
    banner: {
      js: `var __import_meta_url__ = require("url").pathToFileURL(__filename).href;`,
    },
  }),
]);
