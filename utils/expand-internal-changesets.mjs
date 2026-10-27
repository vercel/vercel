/**
 * Changesets will not version a public package that only has a `devDependency`
 * on a changed workspace package. Internals are bundled that way, so before
 * `changeset version` we add the public packages that bundle any released
 * `@vercel-internals/*` package (including via other internals).
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const INTERNAL_PREFIX = '@vercel-internals/';
const BUMP_RANK = { none: 0, patch: 1, minor: 2, major: 3 };
const SKIP_CHANGESET_FILES = new Set(['README.md', 'config.json']);

export function isInternalPackageName(name) {
  return typeof name === 'string' && name.startsWith(INTERNAL_PREFIX);
}

function runtimeDepNames(pkg) {
  return [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.peerDependencies || {}),
    ...Object.keys(pkg.optionalDependencies || {}),
  ];
}

/**
 * Internals bundled into a public package: its `@vercel-internals/*`
 * devDependencies, plus those internals' runtime internals dependencies.
 *
 * @param {object} publicPkg
 * @param {Map<string, object>} packagesByName
 * @returns {Set<string>}
 */
export function internalsBundledBy(publicPkg, packagesByName) {
  const queued = Object.keys(publicPkg.devDependencies || {}).filter(
    isInternalPackageName
  );
  const bundled = new Set();

  while (queued.length > 0) {
    const name = queued.pop();
    if (bundled.has(name)) continue;
    bundled.add(name);
    const pkg = packagesByName.get(name);
    if (!pkg) continue;
    for (const dep of runtimeDepNames(pkg)) {
      if (isInternalPackageName(dep)) queued.push(dep);
    }
  }

  return bundled;
}

/**
 * @param {Array<{ name: string, private?: boolean, dependencies?: object, devDependencies?: object, peerDependencies?: object, optionalDependencies?: object }>} packages
 * @returns {Map<string, Set<string>>} internal package name -> public bundlers
 */
export function publicBundlersByInternal(packages) {
  const packagesByName = new Map(packages.map(pkg => [pkg.name, pkg]));
  const bundlers = new Map();

  for (const pkg of packages) {
    if (pkg.private === true || !pkg.name) continue;
    for (const internalName of internalsBundledBy(pkg, packagesByName)) {
      let publics = bundlers.get(internalName);
      if (!publics) {
        publics = new Set();
        bundlers.set(internalName, publics);
      }
      publics.add(pkg.name);
    }
  }

  return bundlers;
}

function higherBump(a, b) {
  return (BUMP_RANK[a] || 0) >= (BUMP_RANK[b] || 0) ? a : b;
}

/**
 * @param {{ releases: Array<{ name: string, type: string }>, summary: string }} changeset
 * @param {Map<string, Set<string>>} bundlers
 * @returns {{ releases: Array<{ name: string, type: string }>, added: Array<{ name: string, type: string, because: string }>, changed: boolean }}
 */
export function expandChangesetReleases(changeset, bundlers) {
  const releasesByName = new Map(
    changeset.releases.map(release => [release.name, release.type])
  );
  const added = [];
  let changed = false;

  for (const release of changeset.releases) {
    if (!isInternalPackageName(release.name)) continue;
    for (const publicName of bundlers.get(release.name) || []) {
      const existing = releasesByName.get(publicName);
      const nextType = existing
        ? higherBump(existing, release.type)
        : release.type;
      if (existing === nextType) continue;
      if (!existing) {
        added.push({
          name: publicName,
          type: nextType,
          because: release.name,
        });
      }
      releasesByName.set(publicName, nextType);
      changed = true;
    }
  }

  return {
    releases: [...releasesByName.entries()].map(([name, type]) => ({
      name,
      type,
    })),
    added,
    changed,
  };
}

function formatChangeset({ releases, summary }) {
  const frontmatter = releases
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(release => `"${release.name}": ${release.type}`)
    .join('\n');
  const body = summary ? `\n${summary}\n` : '\n';
  return `---\n${frontmatter ? `${frontmatter}\n` : ''}---\n${body}`;
}

async function readWorkspacePackages(repoRoot) {
  const packages = [];
  for (const dirName of ['packages', 'internals']) {
    const dir = join(repoRoot, dirName);
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const pkg = JSON.parse(
          await readFile(join(dir, entry.name, 'package.json'), 'utf8')
        );
        packages.push(pkg);
      } catch (error) {
        if (error && error.code === 'ENOENT') continue;
        throw error;
      }
    }
  }
  return packages;
}

function loadParseChangeset() {
  const require = createRequire(import.meta.url);
  const changesetsRequire = createRequire(
    require.resolve('@changesets/cli/package.json')
  );
  return changesetsRequire('@changesets/parse').default;
}

/**
 * @param {string} repoRoot
 * @returns {Promise<Array<{ file: string, added: Array<{ name: string, type: string, because: string }> }>>}
 */
export async function expandInternalChangesets(repoRoot) {
  const parseChangeset = loadParseChangeset();
  const packages = await readWorkspacePackages(repoRoot);
  const bundlers = publicBundlersByInternal(packages);
  const changesetDir = join(repoRoot, '.changeset');
  const files = await readdir(changesetDir);
  const modified = [];

  for (const file of files) {
    if (!file.endsWith('.md') || SKIP_CHANGESET_FILES.has(file)) continue;
    const path = join(changesetDir, file);
    const original = await readFile(path, 'utf8');
    const parsed = parseChangeset(original);
    if (parsed.releases.length === 0) continue;

    const { releases, added, changed } = expandChangesetReleases(
      parsed,
      bundlers
    );
    if (!changed) continue;

    await writeFile(
      path,
      formatChangeset({ releases, summary: parsed.summary })
    );
    modified.push({ file, added });
  }

  return modified;
}

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? '')) {
  const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const modified = await expandInternalChangesets(repoRoot);
  for (const { file, added } of modified) {
    for (const item of added) {
      console.log(
        `expand-internal-changesets: ${file}: added ${item.name} (${item.type}) because ${item.because} is bundled`
      );
    }
  }
}
