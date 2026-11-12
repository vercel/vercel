import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { esbuild, getDependencies, tsc } from '../../utils/build.mjs';

const pkgPath = fileURLToPath(new URL('package.json', import.meta.url));
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

writeFileSync(
  fileURLToPath(new URL('src/version.ts', import.meta.url)),
  `export const version = ${JSON.stringify(pkg.version)};\n`
);

await Promise.all([
  // Type definitions
  tsc(),

  // CJS build — unbundled, same as current behavior
  esbuild(),

  // ESM build — bundled to avoid .js → .mjs import resolution issues.
  // With bundle:true, esbuild inlines all internal imports so no relative
  // imports remain in the .mjs output. This sidesteps the extension mismatch
  // that caused PR #13784 to fail. Dependencies stay external, like in the
  // CJS build.
  esbuild({
    entryPoints: [
      'src/index.ts',
      'src/index-browser.ts',
      'src/index-edge-light.ts',
    ],
    format: 'esm',
    bundle: true,
    external: getDependencies(),
    outExtension: { '.js': '.mjs' },
  }),
]);
