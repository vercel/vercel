import { copyFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { esbuild, tsc } from '../../utils/build.mjs';

const srcDir = fileURLToPath(new URL('src', import.meta.url));
const distDir = fileURLToPath(new URL('dist', import.meta.url));

// Compile only the TypeScript sources with esbuild. The manifest JSON is part
// of the tsconfig `include` (so `tsc` type-checks the import) but must not be
// treated as an esbuild entry point.
const entryPoints = readdirSync(srcDir)
  .filter(f => f.endsWith('.ts'))
  .map(f => path.join(srcDir, f));

await Promise.all([tsc(), esbuild({ entryPoints })]);

// Ship the hardcoded manifest alongside the compiled output so it is always
// available at runtime without any network access.
copyFileSync(
  path.join(srcDir, 'frameworks.json'),
  path.join(distDir, 'frameworks.json')
);

// Fail the build if the compiled manifest cannot be fully interpreted into
// runtime Framework objects. This guarantees the pinned representation is
// always valid.
const { frameworkList } = await import(path.join(distDir, 'frameworks.js'));
if (!Array.isArray(frameworkList) || frameworkList.length === 0) {
  throw new Error('Interpreted framework list is empty');
}
for (const fw of frameworkList) {
  if (typeof fw.getOutputDirName !== 'function') {
    throw new Error(
      `Framework "${fw.slug ?? fw.name}" did not interpret to a valid getOutputDirName`
    );
  }
}
console.log(
  `Compiled and validated ${frameworkList.length} frameworks from frameworks.json`
);
