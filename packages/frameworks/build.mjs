import { writeFileSync, copyFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { esbuild, tsc } from '../../utils/build.mjs';

const srcDir = fileURLToPath(new URL('src', import.meta.url));
const distDir = fileURLToPath(new URL('dist', import.meta.url));

// The framework manifest is sourced from the frameworks API at build time.
// There is no committed copy in `src/`; the API is the single source of truth.
// If the fetch fails the build fails (no fallback).
const MANIFEST_URL =
  process.env.VERCEL_FRAMEWORKS_MANIFEST_URL ||
  'https://api-frameworks-two.vercel.sh/v1/frameworks.json';

async function fetchManifest() {
  const res = await fetch(MANIFEST_URL);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch frameworks manifest from ${MANIFEST_URL}: ${res.status} ${res.statusText}`
    );
  }
  const manifest = await res.json();
  if (!Array.isArray(manifest) || manifest.length === 0) {
    throw new Error(
      `Frameworks manifest from ${MANIFEST_URL} is empty or not an array`
    );
  }
  return manifest;
}

// Fetch first, then compile. `frameworks.ts` statically imports
// `./frameworks.json`, so the file must exist in `src/` before `tsc`/`esbuild`
// run. The static import (not a runtime `readFileSync`) is what lets esbuild
// inline the manifest when `@vercel/frameworks` is bundled into consumers such
// as `@vercel/static-build` and `@vercel/cli`, which do not ship a sibling
// `frameworks.json` for a runtime read to find.
const manifest = await fetchManifest();
const serialized = `${JSON.stringify(manifest, null, 2)}\n`;

// The gitignored `src/frameworks.json` is consumed by `tsc` (type-checking the
// import) and by the unit tests, which import from `src`.
writeFileSync(path.join(srcDir, 'frameworks.json'), serialized);

// Compile only the TypeScript sources with esbuild. `frameworks.json` is part
// of the tsconfig `include` (so `tsc` type-checks the static import) but must
// not be treated as an esbuild entry point.
const entryPoints = readdirSync(srcDir)
  .filter(f => f.endsWith('.ts'))
  .map(f => path.join(srcDir, f));

await Promise.all([tsc(), esbuild({ entryPoints })]);

// Ship the manifest alongside the compiled output. `dist/frameworks.json` is
// the sibling that `dist/frameworks.js` (and any bundling consumer) resolves,
// and it is the artifact the drift-guard snapshot test reads.
copyFileSync(
  path.join(srcDir, 'frameworks.json'),
  path.join(distDir, 'frameworks.json')
);

// Fail the build if the fetched manifest cannot be fully interpreted into
// runtime Framework objects. This guarantees the sourced representation is
// always valid before it ships.
// Use a file:// URL so the dynamic import works on Windows, where a bare
// absolute path (e.g. `D:\...`) is rejected as an unsupported URL scheme.
const { frameworkList } = await import(
  pathToFileURL(path.join(distDir, 'frameworks.js')).href
);
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
  `Fetched and validated ${frameworkList.length} frameworks from ${MANIFEST_URL}`
);
