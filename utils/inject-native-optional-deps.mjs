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
//   falling back to the JS CLI otherwise.
//
// Safety:
//   - No-op when this version of `vercel` is already on npm (i.e. this is not a
//     publishing run), so it is safe to run on every release invocation.
//   - Hard fails if the version is about to be published but any native package
//     is missing from npm, so `vercel` is never published pointing at
//     optionalDependencies that cannot resolve.

import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { platforms } from '../packages/vc-native/scripts/platforms.mjs';

const execFileAsync = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const cliPackageJsonPath = join(repoRoot, 'packages', 'cli', 'package.json');

// Escape hatch: when the binary release is intentionally disabled (see the
// `binary` job in .github/workflows/release.yml), skip both the injection and
// the missing-natives guard so `vercel` publishes without native
// optionalDependencies. `vc.js` falls back to the JS CLI when no native
// package is present in node_modules.
if (process.env.VERCEL_SKIP_NATIVE_DEPS === '1') {
  console.log(
    'VERCEL_SKIP_NATIVE_DEPS=1; skipping native optionalDependencies injection.'
  );
  process.exit(0);
}

const raw = await readFile(cliPackageJsonPath, 'utf8');
const pkg = JSON.parse(raw);
const version = pkg.version;

if (await isPublished(`vercel@${version}`)) {
  console.log(
    `vercel@${version} is already on npm; skipping native optionalDependencies injection.`
  );
  process.exit(0);
}

const missing = [];
for (const platform of platforms) {
  const spec = `${platform.name}@${version}`;
  if (!(await isPublished(spec))) {
    missing.push(spec);
  }
}

if (missing.length > 0) {
  console.error(
    `::error::Cannot publish vercel@${version}: missing native packages on npm:\n` +
      missing.map(spec => `  - ${spec}`).join('\n') +
      `\nThe binary release must publish these before vercel is packed.`
  );
  process.exit(1);
}

const optionalDependencies = {
  ...(pkg.optionalDependencies ?? {}),
};
for (const platform of platforms) {
  optionalDependencies[platform.name] = version;
}
pkg.optionalDependencies = sortKeys(optionalDependencies);

// Preserve trailing newline behavior of the original file.
const trailingNewline = raw.endsWith('\n') ? '\n' : '';
await writeFile(
  cliPackageJsonPath,
  JSON.stringify(pkg, null, 2) + trailingNewline
);

console.log(
  `Injected native optionalDependencies into packages/cli/package.json for vercel@${version}:`
);
for (const platform of platforms) {
  console.log(`  - ${platform.name}@${version}`);
}

async function isPublished(spec) {
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
