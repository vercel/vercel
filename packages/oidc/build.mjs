import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { esbuild, tsc } from '../../utils/build.mjs';

const pkgPath = fileURLToPath(new URL('package.json', import.meta.url));
const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));

writeFileSync(
  fileURLToPath(new URL('src/version.ts', import.meta.url)),
  `export const version = ${JSON.stringify(pkg.version)};\n`
);

await Promise.all([tsc(), esbuild()]);
