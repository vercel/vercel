// Wire the native per-platform packages onto `vercel` as optionalDependencies
// immediately before it is packed and published.
//
// Why this exists:
//   The @vercel/vc-native-<platform> packages are built on the fly during the
//   release and are not workspace packages, so `packages/cli/package.json` has
//   no optionalDependencies in source. Before `vercel` is packed, we pin those
//   packages at the exact version being published so the published tarball
//   resolves them at install time. `vc.js` walks node_modules for
//   @vercel/vc-native-<platform>-<arch> and trampolines to it when present,
//   falling back to the JS CLI otherwise. Release candidate packing passes
//   `includeCliSupport` and publishes @vercel/cli-support before `vercel`.
//   The native install check also uses it to model a full release.
//
// Safety:
//   - No-op when this version of `vercel` is already on npm (i.e. this is not a
//     vercel publishing run), so it is safe to run on every release invocation.
//   - Does not wait for npm to show @vercel/vc-native-*. Release Binary
//     succeeding is the publish guarantee; npm packument propagation can lag
//     minutes after a successful `npm publish`, which previously blocked
//     `vercel` after the natives were already on the registry. Workspace
//     packages are packed the same way: versions are written, then published
//     without an `npm view` of each dependency. `vc.js` falls back to the JS
//     CLI if a native tarball is not installable yet.

import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { platforms } from '../packages/vc-native/scripts/platforms.mjs';
import { cliSupportName } from './publish-cli-support.mjs';

const execFileAsync = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const defaultCliPackageJsonPath = join(
  repoRoot,
  'packages',
  'cli',
  'package.json'
);

/**
 * Pin native platform packages onto `vercel`'s optionalDependencies.
 *
 * @param {object} [options]
 * @param {string} [options.cliPackageJsonPath]
 * @param {boolean} [options.skipNativeDeps]
 * @param {boolean} [options.includeCliSupport] also pin @vercel/cli-support
 * @param {(spec: string) => Promise<boolean>} [options.isPublished]
 */
export async function injectNativeOptionalDeps({
  cliPackageJsonPath = defaultCliPackageJsonPath,
  skipNativeDeps = process.env.VERCEL_SKIP_NATIVE_DEPS === '1',
  includeCliSupport = false,
  isPublished = isPublishedOnNpm,
} = {}) {
  // Escape hatch: when the binary release is intentionally disabled (see the
  // `binary` job in .github/workflows/release.yml), skip injection so `vercel`
  // publishes without native optionalDependencies. `vc.js` falls back to the
  // JS CLI when no native package is present in node_modules.
  if (skipNativeDeps) {
    return { skipped: true, reason: 'VERCEL_SKIP_NATIVE_DEPS' };
  }

  const raw = await readFile(cliPackageJsonPath, 'utf8');
  const pkg = JSON.parse(raw);
  const version = pkg.version;

  if (await isPublished(`vercel@${version}`)) {
    return { skipped: true, reason: 'already-published', version };
  }

  // Windows runs only the Node CLI until its native binaries are signed; the
  // win32 packages are still published.
  const nativePlatforms = platforms.filter(
    platform => !platform.os.includes('win32')
  );
  const injected = includeCliSupport
    ? [...nativePlatforms, { name: cliSupportName }]
    : nativePlatforms;
  const optionalDependencies = {
    ...(pkg.optionalDependencies ?? {}),
  };
  for (const { name } of injected) {
    optionalDependencies[name] = version;
  }
  pkg.optionalDependencies = sortKeys(optionalDependencies);

  const trailingNewline = raw.endsWith('\n') ? '\n' : '';
  await writeFile(
    cliPackageJsonPath,
    JSON.stringify(pkg, null, 2) + trailingNewline
  );

  return {
    skipped: false,
    version,
    packages: injected.map(({ name }) => `${name}@${version}`),
  };
}

async function isPublishedOnNpm(spec) {
  try {
    await execFileAsync('npm', ['view', spec, 'version']);
    return true;
  } catch {
    return false;
  }
}

function sortKeys(object) {
  return Object.fromEntries(
    Object.entries(object).sort(([left], [right]) => left.localeCompare(right))
  );
}

async function main() {
  const result = await injectNativeOptionalDeps();

  if (result.skipped) {
    if (result.reason === 'VERCEL_SKIP_NATIVE_DEPS') {
      console.log(
        'VERCEL_SKIP_NATIVE_DEPS=1; skipping native optionalDependencies injection.'
      );
    } else {
      console.log(
        `vercel@${result.version} is already on npm; skipping native optionalDependencies injection.`
      );
    }
    return;
  }

  console.log(
    `Injected native optionalDependencies into packages/cli/package.json for vercel@${result.version}:`
  );
  for (const spec of result.packages) {
    console.log(`  - ${spec}`);
  }
}

// Only run when executed directly, so the helpers stay unit testable.
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch(err => {
    console.error(
      `::error::Failed to inject native optionalDependencies: ${err.message}`
    );
    process.exit(1);
  });
}
