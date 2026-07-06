import { copyFileSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import prettier from 'prettier';
import { esbuild, tsc } from '../../utils/build.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const MANIFEST_URL = 'https://api-frameworks-two.vercel.sh/v1/frameworks.json';
const pinnedManifestPath = join(__dirname, 'src', 'frameworks.json');

/**
 * Refresh the pinned manifest from the frameworks API. The result is checked
 * into git so that builds are reproducible and offline builds keep working —
 * a fetch failure is not fatal, the previously pinned manifest is used.
 *
 * Set FRAMEWORKS_SKIP_MANIFEST_REFRESH=1 to skip the network entirely.
 */
async function refreshPinnedManifest() {
  if (process.env.FRAMEWORKS_SKIP_MANIFEST_REFRESH === '1') {
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
    const current = readFileSync(pinnedManifestPath, 'utf8');
    if (JSON.stringify(manifest) !== JSON.stringify(JSON.parse(current))) {
      const next = await prettier.format(JSON.stringify(manifest), {
        parser: 'json',
      });
      writeFileSync(pinnedManifestPath, next);
      console.log(
        `Updated pinned frameworks manifest (${manifest.length} entries) — remember to commit src/frameworks.json`
      );
    } else {
      console.log('Pinned frameworks manifest is up to date');
    }
  } catch (err) {
    console.warn(
      `Warning: could not refresh frameworks manifest from ${MANIFEST_URL}: ${err}. Using the pinned copy.`
    );
  }
}

await refreshPinnedManifest();
await Promise.all([tsc(), esbuild()]);

// esbuild does not copy JSON modules referenced via `resolveJsonModule` when
// not bundling — ship the pinned manifest alongside the compiled output.
copyFileSync(pinnedManifestPath, join(__dirname, 'dist', 'frameworks.json'));
