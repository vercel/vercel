import { writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { esbuild, tsc } from '../../utils/build.mjs';

const distDir = fileURLToPath(new URL('dist', import.meta.url));

// The framework manifest is sourced from the frameworks API at build time and
// written into `dist/`. There is no committed copy in `src/`; the API is the
// single source of truth. If the fetch fails the build fails (no fallback).
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

const [manifest] = await Promise.all([fetchManifest(), tsc(), esbuild()]);

// Write the fetched manifest alongside the compiled output so it is loaded at
// runtime by `frameworks.js`.
writeFileSync(
  path.join(distDir, 'frameworks.json'),
  `${JSON.stringify(manifest, null, 2)}\n`
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
