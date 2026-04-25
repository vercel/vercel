import { tsc, esbuild } from '../../utils/build.mjs';

await Promise.all([
  // Type definitions
  tsc(),

  // CJS build — unbundled, same as current behavior
  esbuild(),

  // ESM build — bundled to avoid .js → .mjs import resolution issues.
  // With bundle:true, esbuild inlines all internal imports so no relative
  // imports remain in the .mjs output. This sidesteps the extension mismatch
  // that caused PR #13784 to fail.
  esbuild({
    entryPoints: ['src/index.ts', 'src/index-browser.ts'],
    format: 'esm',
    bundle: true,
    outExtension: { '.js': '.mjs' },
  }),
]);
