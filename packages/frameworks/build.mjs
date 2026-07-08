import { copyFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';
import { esbuild, tsc } from '../../utils/build.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MANIFEST_URL = 'https://api-frameworks-two.vercel.sh/v1/frameworks.json';
const pinnedManifestPath = join(__dirname, 'src', 'frameworks.json');

/**
 * Fetch the pinned manifest from the frameworks API. The file is not checked
 * into git — it is fetched here and shipped in dist/. A fetch failure is only
 * fatal when no previously fetched copy exists. Set
 * FRAMEWORKS_SKIP_MANIFEST_REFRESH=1 to skip the network and reuse the
 * existing copy.
 */
async function fetchPinnedManifest() {
  const hasExisting = existsSync(pinnedManifestPath);
  if (process.env.FRAMEWORKS_SKIP_MANIFEST_REFRESH === '1' && hasExisting) {
    console.log('Skipping frameworks manifest refresh (env)');
    return;
  }
  try {
    const res = await fetch(MANIFEST_URL, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      throw new Error(`Unexpected status ${res.status}`);
    }
    const manifest = await res.json();
    if (!Array.isArray(manifest) || manifest.length === 0) {
      throw new Error('Malformed manifest');
    }
    const next = await prettier.format(JSON.stringify(manifest), {
      parser: 'json',
    });
    writeFileSync(pinnedManifestPath, next);
    console.log(`Fetched frameworks manifest (${manifest.length} entries)`);
  } catch (err) {
    if (!hasExisting) {
      throw new Error(
        `Failed to fetch the frameworks manifest from ${MANIFEST_URL} and no previously fetched copy exists: ${err}`
      );
    }
    console.warn(
      `Warning: could not refresh frameworks manifest from ${MANIFEST_URL}: ${err}. Reusing the existing copy.`
    );
  }
}

await fetchPinnedManifest();
await Promise.all([tsc(), esbuild()]);

// The manifest is loaded from dist/ at runtime (see loadPinnedManifest).
copyFileSync(pinnedManifestPath, join(__dirname, 'dist', 'frameworks.json'));
