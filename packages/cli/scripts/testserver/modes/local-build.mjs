// Build mode TESTSERVER_RUNNER_BUILD=local: this machine builds the CLI, and
// the runner only tests it. Kept for debugging the in-runner build. main.mjs
// runs the build (build-locally.mjs) before it creates this mode.
//
// The runner starts from a dependency snapshot, `pnpm install --filter
// vercel...` on Linux, keyed by the install inputs (lockfile, workspace
// manifests, pnpm version); runner.mjs adds the runtime, region, team and
// project. Each run uploads one tarball with the built CLI (dist/), its
// runtime workspace dependencies' published files, and the lane's test
// files, packed while the runner starts.
//
// runner.mjs runs a mode through the BuildMode contract documented there and
// never imports this file. To delete this mode, delete:
//   - this file and test/unit/scripts/testserver/modes/local-build.test.ts;
//   - its entry in BUILD_MODES in main.mjs;
//   - the `local` value of TESTSERVER_RUNNER_BUILD in runnerBuild()
//     (runner-config.mjs);
//   - its paragraph in test/testserver/README.md (TESTSERVER_RUNNER_BUILD=local).
import { createHash } from 'node:crypto';
import {
  existsSync,
  readdirSync,
  readFileSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { join, relative, sep } from 'node:path';
import {
  createTarball,
  parsePnpmVersion,
  parseWorkspacePattern,
  ROOT_INSTALL_INPUTS,
  RunnerError,
  workspacePatterns,
} from '../files.mjs';
import {
  bashScript,
  megabytes,
  REMOTE_ROOT,
  RUNNER_REGION,
  RUNNER_RUNTIME,
  runChecked,
  secs,
  stagingPath,
} from '../remote.mjs';
import { testRunnerVcpus } from '../runner-config.mjs';

/**
 * The dependency snapshot's recipe format. Bump when the snapshot changes in
 * a way DEPS_INSTALL_SCRIPT doesn't show (the steps around it), so old
 * snapshots stop matching. The key hashes the script itself.
 */
export const DEPS_SNAPSHOT_FORMAT = 2;
const DEPS_SNAPSHOT_BUILD_VCPUS = 4;
// Upload names in the sandbox's staging directory.
const INPUTS_TARBALL = 'install-inputs.tgz';
const SYNC_TARBALL = 'sync.tgz';

/** The dependency snapshot's install: only the CLI and its dependencies. */
export const DEPS_INSTALL_SCRIPT = bashScript([
  'corepack pnpm install --frozen-lockfile --filter vercel...',
]);

// Test-side files the lane needs, relative to the repo root. The CLI's `src/`
// is included because global-setup.ts compares its mtimes with dist/.
const CLI_SYNC_PATHS = [
  'packages/cli/package.json',
  'packages/cli/vitest.testserver.config.mts',
  'packages/cli/dist',
  'packages/cli/src',
  'packages/cli/scripts',
  'packages/cli/test/testserver',
  'packages/cli/test/helpers/setup-unit-fixture.ts',
  'packages/cli/test/helpers/get-cli-path.ts',
];
const SYNC_EXCLUDE_DIRS = new Set(['node_modules', '.results']);

// ---------------------------------------------------------------------------
// Pure helpers

/**
 * The dependency snapshot's recipe key: sha256 over the install inputs, the
 * pnpm version and the recipe (its format and install script, `recipe`).
 * Independent of file order.
 */
export function depsSnapshotKey({
  files,
  pnpmVersion,
  format,
  recipe = DEPS_INSTALL_SCRIPT,
}) {
  const hash = createHash('sha256');
  hash.update(`format=${format}\0pnpm=${pnpmVersion}\0`);
  hash.update(`${recipe}\0`);
  for (const { path, content } of [...files].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0
  )) {
    hash.update(`${path}\0${content.length}\0`);
    hash.update(content);
    hash.update('\0');
  }
  return hash.digest('hex');
}

function globToRegExp(pattern) {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `^${escaped.replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]')}$`
  );
}

// ---------------------------------------------------------------------------
// Effects

/**
 * Files the dependency snapshot's `pnpm install` reads, relative to the repo
 * root: the root manifests and lockfile plus every workspace project's
 * package.json. Supports the `dir` and `dir/*` patterns the repo uses.
 */
export function installInputPaths(repoRoot) {
  const paths = ROOT_INSTALL_INPUTS.filter(p => existsSync(join(repoRoot, p)));
  const excluded = new Set();
  const manifests = new Set();
  for (const pattern of workspacePatterns(repoRoot).map(
    parseWorkspacePattern
  )) {
    const { negated } = pattern;
    let dirs;
    if (pattern.parent !== undefined) {
      const { parent } = pattern;
      const abs = join(repoRoot, parent);
      dirs = existsSync(abs)
        ? readdirSync(abs, { withFileTypes: true })
            .filter(e => e.isDirectory())
            .map(e => `${parent}/${e.name}`)
        : [];
    } else {
      dirs = [pattern.dir];
    }
    for (const dir of dirs) {
      const manifest = `${dir}/package.json`;
      if (negated) excluded.add(manifest);
      else if (existsSync(join(repoRoot, manifest))) manifests.add(manifest);
    }
  }
  return [...paths, ...[...manifests].filter(m => !excluded.has(m)).sort()];
}

/** The pnpm version from the root package.json's `packageManager`. */
export function pnpmVersion(repoRoot) {
  return parsePnpmVersion(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
}

/** Paths a package's `files` entry matches, relative to the package dir. */
function expandFilesEntry(pkgDir, entry) {
  const clean = entry.replace(/^\.\//, '').replace(/\/+$/, '');
  if (!/[*?]/.test(clean)) {
    return existsSync(join(pkgDir, clean)) ? [clean] : [];
  }
  if (clean.includes('/')) {
    throw new RunnerError(
      `Unsupported \`files\` glob \`${entry}\` in ${pkgDir}/package.json; extend expandFilesEntry() in scripts/testserver/modes/local-build.mjs`
    );
  }
  const re = globToRegExp(clean);
  return readdirSync(pkgDir)
    .filter(name => re.test(name))
    .sort();
}

/**
 * The CLI's runtime workspace dependencies, transitively: every
 * `dependencies` entry using the `workspace:` protocol. Each is
 * `{ name, dir, include }` with `dir` and `include` relative to `repoRoot`;
 * `include` is the package.json plus its published `files` (or `dist`).
 * `!` negations are ignored, which only adds a few files.
 */
export function workspaceRuntimeDeps(cliDir, repoRoot) {
  const realRoot = realpathSync(repoRoot);
  const seen = new Map();
  const visit = dir => {
    const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    for (const [name, spec] of Object.entries(pkg.dependencies ?? {})) {
      if (typeof spec !== 'string' || !spec.startsWith('workspace:')) continue;
      const link = join(dir, 'node_modules', name);
      if (!existsSync(link)) {
        throw new RunnerError(
          `${name} is not installed in ${relative(realRoot, dir) || '.'}; run pnpm install`
        );
      }
      const real = realpathSync(link);
      if (seen.has(real)) continue;
      const depPkg = JSON.parse(
        readFileSync(join(real, 'package.json'), 'utf8')
      );
      const entries = Array.isArray(depPkg.files) ? depPkg.files : ['dist'];
      // POSIX separators: these become tar entries unpacked on Linux.
      const rel = relative(realRoot, real).split(sep).join('/');
      const include = new Set([`${rel}/package.json`]);
      for (const entry of entries) {
        if (typeof entry !== 'string' || entry.startsWith('!')) continue;
        for (const match of expandFilesEntry(real, entry)) {
          include.add(`${rel}/${match}`);
        }
      }
      seen.set(real, { name, dir: rel, include: [...include] });
      visit(real);
    }
  };
  visit(realpathSync(cliDir));
  return [...seen.values()].sort((a, b) => (a.dir < b.dir ? -1 : 1));
}

function listFiles(repoRoot, relPath, out) {
  const abs = join(repoRoot, relPath);
  let stat;
  try {
    stat = statSync(abs);
  } catch {
    return;
  }
  if (stat.isFile()) {
    out.push(relPath);
    return;
  }
  if (!stat.isDirectory()) return;
  for (const entry of readdirSync(abs, { withFileTypes: true })) {
    if (entry.isDirectory() && SYNC_EXCLUDE_DIRS.has(entry.name)) continue;
    const child = `${relPath}/${entry.name}`;
    if (entry.isDirectory()) listFiles(repoRoot, child, out);
    else if (entry.isFile() || entry.isSymbolicLink()) out.push(child);
  }
}

/**
 * Every file in the per-run tarball, relative to the repo root and sorted:
 * the lane's CLI files plus the runtime workspace dependencies. Skips
 * `node_modules` and `.results`.
 */
export function syncPaths(repoRoot) {
  const roots = [
    ...CLI_SYNC_PATHS,
    ...workspaceRuntimeDeps(join(repoRoot, 'packages/cli'), repoRoot).flatMap(
      dep => dep.include
    ),
  ];
  const files = [];
  for (const root of roots) listFiles(repoRoot, root, files);
  return [...new Set(files)].sort();
}

/**
 * Upload a local gzip tarball as `name` in the staging directory, extract it
 * under REMOTE_ROOT, and remove it.
 */
async function uploadTarball(sandbox, tarball, name, label) {
  const remotePath = await stagingPath(sandbox, name);
  await sandbox.writeFiles([{ path: remotePath, content: tarball }]);
  await runChecked(sandbox, label, 'tar', [
    '--warning=no-unknown-keyword',
    '-xzf',
    remotePath,
    '-C',
    REMOTE_ROOT,
  ]);
  await sandbox
    .runCommand({ cmd: 'rm', args: ['-f', remotePath] })
    .catch(() => {});
}

/**
 * This mode as a BuildMode (see runner.mjs). Its snapshot is node_modules for
 * the CLI, installed on Linux from the current install inputs. Each run
 * uploads the files built here, listed here so a missing runtime dependency
 * or an unsupported `files` glob fails before any sandbox starts, and packed
 * while the runner starts; a failed pack stops the runner's start through
 * `ready`. main.mjs builds the CLI before calling this, so the listing sees
 * the new dist/. Throws RunnerError for those and when the checkout has no
 * pnpm version.
 */
export function localBuildMode({ repoRoot }) {
  const inputPaths = installInputPaths(repoRoot);
  const files = inputPaths.map(path => ({
    path,
    content: readFileSync(join(repoRoot, path)),
  }));
  const pnpm = pnpmVersion(repoRoot);
  const key = depsSnapshotKey({
    files,
    pnpmVersion: pnpm,
    format: DEPS_SNAPSHOT_FORMAT,
  });
  // The built CLI, its runtime workspace deps and the lane's files.
  const syncList = syncPaths(repoRoot);
  const packed = createTarball(repoRoot, syncList);
  // The runner waits for this alongside its start, so a failed pack stops it.
  const ready = packed.then(() => {});
  ready.catch(() => {});
  return {
    summary: 'against the CLI built on this machine',
    vcpus: testRunnerVcpus,
    ready,
    startedNote: '',
    snapshot: {
      key,
      vcpus: DEPS_SNAPSHOT_BUILD_VCPUS,
      missMessage: `No dependency snapshot for this lockfile yet (key ${key.slice(0, 12)}). Building one remotely: pnpm ${pnpm} install in a build sandbox (${RUNNER_REGION}, ${RUNNER_RUNTIME}, ${DEPS_SNAPSHOT_BUILD_VCPUS} vCPUs). This happens once per lockfile change and takes about 30s...`,
      builtFor: 'this lockfile',
      entry: {},
      begin({ log, prefix }) {
        // Pack the install inputs while the build sandbox starts.
        const packed = createTarball(repoRoot, inputPaths);
        packed.catch(() => {});
        return async (sandbox, step) => {
          await uploadTarball(
            sandbox,
            await packed,
            INPUTS_TARBALL,
            'Extracting the install inputs'
          );
          log(
            `${prefix} ✓ Uploaded the install inputs (${inputPaths.length} files)`
          );
          await step('pnpm install', DEPS_INSTALL_SCRIPT);
        };
      },
    },
    /** Upload and extract the packed files. */
    async apply(sandbox, { phases, log }) {
      const tarball = await packed;
      const startedAt = Date.now();
      await uploadTarball(
        sandbox,
        tarball,
        SYNC_TARBALL,
        'Extracting the workspace'
      );
      const ms = Date.now() - startedAt;
      phases.push(`upload ${megabytes(tarball.length)} ${secs(ms)}`);
      log(
        `✓ [runner] Uploaded ${syncList.length} files (${megabytes(tarball.length)}) in ${secs(ms)}`
      );
    },
  };
}
