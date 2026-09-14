import { esbuild, tsc, getDependencies } from '../../../utils/build.mjs';

// pep440 v5 is ESM-only. Bundle it so the CommonJS entrypoint can load it and
// so downstream builders do not need to parse its newer export syntax.
const externals = getDependencies().filter(
  dependency => dependency !== '@renovatebot/pep440'
);
const supported = {
  // Esbuild lowers these export names into the bundle's ES2021-compatible
  // helper code.
  'arbitrary-module-namespace-names': true,
};

await Promise.all([
  tsc(),
  // ESM build
  esbuild({
    bundle: true,
    format: 'esm',
    external: [...externals, '#wasm/*'],
    supported,
  }),
  // CJS build
  esbuild({
    bundle: true,
    format: 'cjs',
    outfile: 'dist/index.cjs',
    external: [...externals, '#wasm/*'],
    supported,
    // Polyfill for import.meta.url
    define: {
      'import.meta.url': '__import_meta_url__',
    },
    banner: {
      js: `var __import_meta_url__ = require("url").pathToFileURL(__filename).href;`,
    },
  }),
]);
