import execa from 'execa';
import { createHash } from 'node:crypto';
import { readdir, readFile, stat } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';
import { outputJSON, pathExists } from 'fs-extra';
import output from '../../output-manager';

/**
 * Points `vercel onboard` at a local checkout of the `vercel/ai` monorepo
 * instead of the npm registry.
 *
 * The capabilities this command depends on — running a harness against the
 * user's own machine with no sandbox provider, and reusing an already installed
 * `claude` executable rather than downloading a second 236MB copy of it — are
 * on a branch and not in a published release. Until they ship, a contributor
 * sets this to their checkout and gets the branch build.
 */
export const HARNESS_SOURCE_ENV_VAR = 'VERCEL_ONBOARD_HARNESS_SOURCE';

/** Where packages live inside the `ai` monorepo. */
const PACKAGES_DIR = 'packages';

/** Recorded alongside the tarballs so an unchanged build skips reinstalling. */
const FINGERPRINT_FILE = '.source-fingerprint';

export interface LocalHarnessSource {
  /** Absolute path to the `ai` monorepo checkout. */
  root: string;
}

/**
 * Resolve the configured local source, if any.
 *
 * Returns `undefined` when the variable is unset, which is the normal path:
 * packages then come from the registry.
 */
export function getLocalHarnessSource(
  cwd: string
): LocalHarnessSource | undefined {
  const configured = process.env[HARNESS_SOURCE_ENV_VAR]?.trim();
  if (!configured) {
    return undefined;
  }

  return {
    root: isAbsolute(configured) ? configured : resolve(cwd, configured),
  };
}

export interface PackedPackage {
  name: string;
  version: string;
  /** Absolute path to the packed tarball. */
  tarball: string;
}

/**
 * Pack the requested packages out of the checkout, into `destination`.
 *
 * Tarballs rather than `file:` directory links, because these packages declare
 * their dependencies on each other with pnpm's `workspace:*` protocol, which npm
 * cannot resolve. `pnpm pack` rewrites those to concrete versions, which npm
 * then satisfies from the sibling tarball.
 *
 * Returns `undefined` and reports why when the checkout cannot supply them.
 */
export async function packLocalHarnessPackages(options: {
  source: LocalHarnessSource;
  /** Package names, e.g. `@ai-sdk/harness`. */
  packages: string[];
  destination: string;
}): Promise<PackedPackage[] | undefined> {
  const { source, packages, destination } = options;

  const dirs: { name: string; dir: string }[] = [];
  for (const name of packages) {
    const dir = await resolvePackageDir(source.root, name);
    if (!dir) return undefined;
    dirs.push({ name, dir });
  }

  const fingerprint = await fingerprintSources(dirs.map(entry => entry.dir));
  const cached = await readCachedPack(destination, fingerprint, packages);
  if (cached) {
    output.debug(
      'onboard: local harness build unchanged, reusing the tarballs'
    );
    return cached;
  }

  const packed: PackedPackage[] = [];
  for (const { name, dir } of dirs) {
    const tarball = await packOne(name, dir, destination);
    if (!tarball) return undefined;
    packed.push(tarball);
  }

  await writeCachedPack(destination, fingerprint, packed);
  return packed;
}

/**
 * Locate a package directory and confirm it is the package that was asked for.
 *
 * The directory is derived from the unscoped name — `@ai-sdk/harness-codex` is
 * `packages/harness-codex` — and then verified against the manifest, so a
 * checkout that is laid out differently fails with a clear message instead of
 * packing the wrong thing.
 */
async function resolvePackageDir(
  root: string,
  name: string
): Promise<string | undefined> {
  const dir = join(root, PACKAGES_DIR, name.replace(/^@[^/]+\//, ''));
  const manifestPath = join(dir, 'package.json');

  if (!(await pathExists(manifestPath))) {
    output.error(
      `${HARNESS_SOURCE_ENV_VAR} is set to ${root}, but it has no ${name} package.\n` +
        `Looked for: ${manifestPath}`
    );
    return undefined;
  }

  const manifest = await readManifest(manifestPath);
  if (manifest?.name !== name) {
    output.error(
      `${manifestPath} declares "${manifest?.name}", not "${name}". ` +
        `Is ${HARNESS_SOURCE_ENV_VAR} pointing at a checkout of vercel/ai?`
    );
    return undefined;
  }

  // Packing an unbuilt package produces a tarball with no `dist`, which fails
  // much later as an unresolvable import. Catch it here instead.
  if (!(await pathExists(join(dir, 'dist')))) {
    output.error(
      `${name} has not been built in ${root}.\n` +
        `Build it first:  pnpm --filter ${name} build`
    );
    return undefined;
  }

  return dir;
}

async function packOne(
  name: string,
  dir: string,
  destination: string
): Promise<PackedPackage | undefined> {
  try {
    const { stdout } = await execa(
      'pnpm',
      ['pack', '--pack-destination', destination],
      { cwd: dir, stdio: 'pipe', reject: true }
    );

    // pnpm prints a short report; the tarball path is the last line of it.
    const tarball = stdout
      .split('\n')
      .map(line => line.trim())
      .reverse()
      .find(line => line.endsWith('.tgz'));

    if (!tarball) {
      output.error(
        `Could not determine the tarball \`pnpm pack\` wrote for ${name}.`
      );
      return undefined;
    }

    const manifest = await readManifest(join(dir, 'package.json'));
    return { name, version: manifest?.version ?? '0.0.0', tarball };
  } catch (err) {
    output.error(
      `Failed to pack ${name} from ${dir}: ${
        err instanceof Error ? err.message.split('\n')[0] : String(err)
      }`
    );
    return undefined;
  }
}

/**
 * Summarize the built output of each package.
 *
 * Size and mtime of everything under `dist`, which is what actually ends up in
 * the tarball. Hashing file contents would be more precise and much slower, and
 * the only thing riding on it is whether to skip a reinstall.
 */
async function fingerprintSources(dirs: string[]): Promise<string> {
  const hash = createHash('sha256');

  for (const dir of dirs) {
    hash.update(dir);
    for (const entry of await walk(join(dir, 'dist'))) {
      hash.update(`${entry.path}:${entry.size}:${entry.mtimeMs}`);
    }
  }

  return hash.digest('hex');
}

async function walk(
  dir: string
): Promise<{ path: string; size: number; mtimeMs: number }[]> {
  const found: { path: string; size: number; mtimeMs: number }[] = [];

  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return found;
  }

  // Sorted so the fingerprint does not depend on directory iteration order.
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...(await walk(path)));
    } else if (entry.isFile()) {
      const stats = await stat(path);
      found.push({ path, size: stats.size, mtimeMs: stats.mtimeMs });
    }
  }

  return found;
}

async function readCachedPack(
  destination: string,
  fingerprint: string,
  packages: string[]
): Promise<PackedPackage[] | undefined> {
  try {
    const raw = await readFile(join(destination, FINGERPRINT_FILE), 'utf-8');
    const cached = JSON.parse(raw) as {
      fingerprint?: string;
      packed?: PackedPackage[];
    };

    if (cached.fingerprint !== fingerprint || !cached.packed) {
      return undefined;
    }

    // The record is only as good as the files it points at.
    const names = cached.packed.map(entry => entry.name);
    if (packages.some(name => !names.includes(name))) {
      return undefined;
    }
    for (const entry of cached.packed) {
      if (!(await pathExists(entry.tarball))) return undefined;
    }

    return cached.packed.filter(entry => packages.includes(entry.name));
  } catch {
    return undefined;
  }
}

async function writeCachedPack(
  destination: string,
  fingerprint: string,
  packed: PackedPackage[]
): Promise<void> {
  try {
    await outputJSON(join(destination, FINGERPRINT_FILE), {
      fingerprint,
      packed,
    });
  } catch (err) {
    // Only costs a redundant repack next time.
    output.debug(
      `onboard: could not record the local harness fingerprint: ${
        err instanceof Error ? err.message : String(err)
      }`
    );
  }
}

async function readManifest(
  path: string
): Promise<{ name?: string; version?: string } | undefined> {
  try {
    return JSON.parse(await readFile(path, 'utf-8'));
  } catch {
    return undefined;
  }
}
