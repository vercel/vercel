// Build mode TESTSERVER_RUNNER_BUILD=runner, the default: the runner builds
// the CLI, and the laptop does no build work.
//
// Each run:
//   1. resolves the base, or merge-base: the newest main commit that HEAD
//      contains, the newer of `git merge-base HEAD main` and
//      `git merge-base HEAD origin/main`, from local refs. It moves only
//      when the branch is rebased or restacked onto a newer main;
//   2. finds or builds a snapshot of that base: toolchains, the base's tracked
//      files committed to a git index, `pnpm install`, and a full
//      `turbo run build:package --filter=vercel` into turbo's local cache.
//      Keyed by the base, the recipe format, the runtime, the region and the
//      runner's team and project. The branch's own commits never rebuild it;
//      step 3 handles them. The toolchain versions (pnpm, Rust) come from the
//      base too;
//   3. uploads `git diff --binary <base>` of the working tree and the
//      untracked files (nested Git repositories left out), applies and
//      commits them in the runner, runs `pnpm install` when an install input
//      differs from the base, then the turbo build, which rebuilds only what
//      the branch changed.
//
// A checkout with Git submodules is refused: neither the patch nor the
// base's archive carries them.
//
// runner.mjs runs a mode through the BuildMode contract documented there and
// never imports this file. To delete this mode, delete:
//   - this file and test/unit/scripts/testserver/modes/runner-build.test.ts;
//   - its entry in BUILD_MODES in main.mjs;
//   - the `runner` value of TESTSERVER_RUNNER_BUILD in runnerBuild()
//     (runner-config.mjs), and make another mode the default;
//   - its section in test/testserver/README.md ("How the runner builds the
//     CLI").
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { posix } from 'node:path';
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
  outputRule,
  REMOTE_ROOT,
  RUNNER_REGION,
  RUNNER_RUNTIME,
  runChecked,
  runStep,
  secs,
  stagingDir,
} from '../remote.mjs';
import { buildRunnerVcpus, LOCAL_BUILD_HINT } from '../runner-config.mjs';

/**
 * Bump when the snapshot changes in a way its scripts don't show (the steps
 * between them, what is uploaded, the build sandbox), so old snapshots stop
 * matching. The key hashes the scripts themselves (recipeText()), so editing
 * one, or the uv or Go version, needs no bump.
 */
export const SNAPSHOT_FORMAT = 4;
const SNAPSHOT_BUILD_VCPUS = 8;
/**
 * The refs the snapshot's base can be the merge-base with, preferred first
 * when their merge-bases have diverged.
 */
export const BASE_REFS = ['main', 'origin/main'];
// The base's `git archive` is about 74 MB; a patch can be large too.
const GIT_MAX_BUFFER = 1024 * 1024 * 1024;
/** Where the repo pins the Rust toolchain that turbo's wasm build uses. */
export const RUST_TOOLCHAIN_FILE =
  'packages/python-analysis/rust-toolchain.toml';

// The snapshot recipe. uv and Go match .github/workflows/cli-testserver.yml,
// and a unit test keeps them in step with it. Rust is the base's
// RUST_TOOLCHAIN_FILE, which CI pins too, installed as the default toolchain
// so a build never downloads it.
// The key hashes the scripts these feed, so changing them needs no
// SNAPSHOT_FORMAT bump.
export const UV_VERSION = '0.13.5';
export const GO_VERSION = '1.23.12';
// Where toolchainScript() installs Rust, Go and uv.
const TOOLCHAIN_PATH =
  '$HOME/.cargo/bin:/usr/local/go/bin:$HOME/.local/bin:$PATH';
const GIT_IDENTITY =
  "-c user.email=testserver-runner@vercel.invalid -c user.name='Testserver runner' -c commit.gpgsign=false";
/** Upload names in the sandbox's staging directory. */
export const BASE_TARBALL = 'base.tgz';
export const BASE_FILE_LIST = 'base-files';
export const RUN_PATCH = 'run.patch';
export const RUN_UNTRACKED_TARBALL = 'untracked.tgz';
export const RUN_UNTRACKED_LIST = 'untracked-files';

/**
 * A bash script of `lines` with the toolchains on PATH. The snapshot's and
 * each run's install and build share this env, so turbo computes the same
 * hashes in both; turbo uses only its local cache in the runner.
 */
const runnerScript = lines =>
  bashScript([
    `export PATH="${TOOLCHAIN_PATH}"`,
    'export TURBO_TELEMETRY_DISABLED=1',
    'unset TURBO_TOKEN TURBO_TEAM TURBO_API',
    ...lines,
  ]);

// ---------------------------------------------------------------------------
// Pure helpers

/**
 * The runner snapshot's recipe key: sha256 over the base commit and the
 * recipe (its format and the text of its scripts, `recipe`). runner.mjs adds
 * the runtime, region, team and project.
 */
export function snapshotKey({ base, format, recipe = recipeText() }) {
  return createHash('sha256')
    .update(`format=${format}\0base=${base}\0`)
    .update(recipe)
    .digest('hex');
}

/**
 * The text of the snapshot's scripts, for its key. What comes from the base
 * (the pnpm and Rust versions, the commit) and the per-sandbox staging
 * directory are placeholders: the key covers the base on its own, and the
 * staging directory differs on every build.
 */
export function recipeText() {
  return [
    toolchainScript({
      pnpm: '<pnpm>',
      rust: { channel: '<rust>', targets: ['<target>'] },
    }),
    baseIndexScript('<base>', '<staging>'),
    INSTALL_SCRIPT,
    BUILD_SCRIPT,
  ].join('\0');
}

/**
 * Installs the snapshot's toolchains: git, gcc, pnpm, uv, Rust and Go.
 * `rust` is `{ channel, targets }` from the base's rust-toolchain.toml.
 */
export function toolchainScript({ pnpm, rust }) {
  return runnerScript([
    'sudo dnf install -y -q git gcc',
    `sudo npm install -g --no-fund --no-audit --loglevel=error pnpm@${pnpm}`,
    `curl -LsSf https://astral.sh/uv/${UV_VERSION}/install.sh | env UV_NO_MODIFY_PATH=1 sh`,
    // The image has no Python >= 3.12. Without one, turbo resolves
    // vercel-runtime#build and vercel-workers#build as uncacheable with a
    // different external-dependency hash, and the first build's uv then
    // downloads one, so every later run hashes them differently. Installing
    // the Python that uv would download (its newest, as nothing pins one)
    // makes the first build's hashes the steady-state ones.
    'uv python install',
    `curl -sSf https://sh.rustup.rs | sh -s -- -y --no-modify-path --profile minimal --default-toolchain ${rust.channel}`,
    ...(rust.targets.length > 0
      ? [
          `rustup target add --toolchain ${rust.channel} ${rust.targets.join(' ')}`,
        ]
      : []),
    `curl -sSL https://go.dev/dl/go${GO_VERSION}.linux-amd64.tar.gz | sudo tar -C /usr/local -xz`,
    'echo "pnpm $(pnpm --version), $(uv --version), $(uv python find), $(rustc --version), $(go version)"',
  ]);
}

/**
 * Extracts the base's tree and commits exactly its tracked files. Runs before
 * `pnpm install`: `git add -A` would drop tracked files that .gitignore
 * matches, and without .git turbo skips symlinks, so every hash would change.
 * `stagingDir` holds the uploaded BASE_TARBALL and BASE_FILE_LIST.
 */
export function baseIndexScript(base, stagingDir) {
  const tarball = `${stagingDir}/${BASE_TARBALL}`;
  const fileList = `${stagingDir}/${BASE_FILE_LIST}`;
  return runnerScript([
    `tar --warning=no-unknown-keyword -xzf ${tarball} -C ${REMOTE_ROOT}`,
    `rm -f ${tarball}`,
    'git -c init.defaultBranch=main init -q',
    `git --literal-pathspecs add -f --pathspec-from-file=${fileList} --pathspec-file-nul`,
    `rm -f ${fileList}`,
    `git ${GIT_IDENTITY} commit -q --no-verify -m 'base ${base}'`,
  ]);
}

/** Lists the untracked files in the upload line up to this many. */
export const UNTRACKED_LISTED_MAX = 10;

/**
 * The untracked files part of the upload line: the count, then the paths when
 * there are at most UNTRACKED_LISTED_MAX of them.
 */
export function untrackedSummary(untracked) {
  const count = `${untracked.length} untracked file${untracked.length === 1 ? '' : 's'}`;
  if (untracked.length === 0 || untracked.length > UNTRACKED_LISTED_MAX) {
    return count;
  }
  return `${count}: ${untracked.join(', ')}`;
}

/**
 * Applies and commits one run's patch and untracked files, RUN_PATCH,
 * RUN_UNTRACKED_TARBALL and RUN_UNTRACKED_LIST in `stagingDir`.
 */
export function applyScript(stagingDir) {
  const patch = `${stagingDir}/${RUN_PATCH}`;
  const tarball = `${stagingDir}/${RUN_UNTRACKED_TARBALL}`;
  const list = `${stagingDir}/${RUN_UNTRACKED_LIST}`;
  return runnerScript([
    // A build may have rewritten tracked files with the same content.
    'git update-index -q --refresh || true',
    `if [ -s ${patch} ]; then git apply --index --binary ${patch}; fi`,
    `if [ -s ${tarball} ]; then`,
    `  tar --warning=no-unknown-keyword -xzf ${tarball} -C ${REMOTE_ROOT}`,
    `  git --literal-pathspecs add -f --pathspec-from-file=${list} --pathspec-file-nul`,
    'fi',
    `git ${GIT_IDENTITY} commit -q --no-verify --allow-empty -m run`,
    `rm -f ${patch} ${tarball} ${list}`,
  ]);
}

export const INSTALL_SCRIPT = runnerScript(['pnpm install --frozen-lockfile']);

/**
 * The CLI build with turbo's local cache only. `new-only` prints the output
 * of every task that runs and only the hash of cached ones, so a snapshot's
 * cold build shows progress and a run's build stays short. `stream` prints
 * each line as it arrives instead of letting turbo group output per task.
 */
export const BUILD_SCRIPT = runnerScript([
  'pnpm exec turbo --no-update-notifier run build:package --filter=vercel --cache=local:rw --output-logs=new-only --log-order=stream',
]);

function workspacePatternMatches(pattern, dir) {
  return pattern.parent === undefined
    ? pattern.dir === dir
    : posix.dirname(dir) === pattern.parent;
}

/**
 * Whether `pnpm install` reads `path`, relative to the repo root. Uses path
 * shape rather than file existence, so a deleted install input still counts.
 */
export function isInstallInputPath(path, patterns) {
  if (ROOT_INSTALL_INPUTS.includes(path)) return true;
  if (posix.basename(path) !== 'package.json') return false;
  const dir = posix.dirname(path);
  let included = false;
  for (const pattern of patterns.map(parseWorkspacePattern)) {
    if (!workspacePatternMatches(pattern, dir)) continue;
    if (pattern.negated) return false;
    included = true;
  }
  return included;
}

/**
 * The paths of the submodules (gitlinks, mode 160000) in `git ls-files
 * --stage -z` entries.
 */
export function submodulePaths(entries) {
  const paths = [];
  for (const entry of entries) {
    if (!entry.startsWith('160000 ')) continue;
    paths.push(entry.slice(entry.indexOf('\t') + 1));
  }
  return paths;
}

/**
 * `{ channel, targets }` from a rust-toolchain.toml, without a TOML parser.
 * Supports the one-line `channel = "..."` and `targets = [...]` the repo uses.
 */
export function parseRustToolchain(toml) {
  const channel = /^\s*channel\s*=\s*"([^"]+)"/m.exec(toml)?.[1];
  if (!channel) {
    throw new RunnerError(
      `${RUST_TOOLCHAIN_FILE} has no \`channel = "..."\`; the runner snapshot installs that toolchain`
    );
  }
  const list = /^\s*targets\s*=\s*\[([^\]]*)\]/m.exec(toml)?.[1] ?? '';
  const targets = [...list.matchAll(/"([^"]+)"/g)].map(m => m[1]);
  return { channel, targets };
}

/** The entries of NUL-separated git output (`-z`), without the empty tail. */
export function splitNul(output) {
  return String(output).split('\0').filter(Boolean);
}

/**
 * Splits `git ls-files --others` entries into files and nested Git
 * repositories, which it lists as `dir/`. Returns `{ untracked, nestedRepos }`,
 * the repositories without the trailing slash.
 */
export function partitionUntracked(entries) {
  const untracked = [];
  const nestedRepos = [];
  for (const entry of entries) {
    if (entry.endsWith('/')) nestedRepos.push(entry.slice(0, -1));
    else untracked.push(entry);
  }
  return { untracked, nestedRepos };
}

/**
 * Whether the runner must run `pnpm install` on top of the snapshot: true
 * when a changed, deleted or untracked path is one of the install inputs.
 */
export function installNeededFor({ changed, untracked, patterns }) {
  return [...changed, ...untracked].some(path =>
    isInstallInputPath(path, patterns)
  );
}

// ---------------------------------------------------------------------------
// Effects

/** `git -C repoRoot <args>` → stdout as a Buffer. Rejects with stderr. */
function git(repoRoot, args) {
  return new Promise((resolvePromise, reject) => {
    execFile(
      'git',
      ['-C', repoRoot, ...args],
      {
        encoding: 'buffer',
        maxBuffer: GIT_MAX_BUFFER,
        // Read-only: don't take the index lock to refresh it.
        env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
      },
      (err, stdout, stderr) => {
        if (err) {
          const detail = String(stderr ?? '').trim() || err.message;
          // The subcommand comes after any `-c <name>=<value>` options.
          const command = args.find(
            (arg, i) => arg !== '-c' && args[i - 1] !== '-c'
          );
          reject(
            Object.assign(new RunnerError(`git ${command} failed: ${detail}`), {
              gitExitCode: err.code,
            })
          );
        } else {
          resolvePromise(stdout);
        }
      }
    );
  });
}

/** Whether commit `ancestor` is an ancestor of, or is, commit `descendant`. */
async function isAncestor(repoRoot, ancestor, descendant) {
  try {
    await git(repoRoot, ['merge-base', '--is-ancestor', ancestor, descendant]);
    return true;
  } catch (err) {
    // Exit code 1 means "not an ancestor"; anything else is a real failure.
    if (err.gitExitCode === 1) return false;
    throw err;
  }
}

/**
 * The base for a runner build, from local refs only: `{ base, ref }`, `base`
 * being the full SHA of `git merge-base HEAD <ref>` for one of `refs`. Of
 * the refs that exist and share history with HEAD, the newest merge-base
 * wins, so a stale local main doesn't pull the upstream commits HEAD already
 * has into the patch. When merge-bases have diverged, the earlier ref wins.
 * Throws RunnerError when no ref qualifies.
 */
export async function resolveBase(repoRoot, refs = BASE_REFS) {
  const problems = [];
  let best;
  for (const ref of refs) {
    try {
      await git(repoRoot, [
        'rev-parse',
        '--verify',
        '--quiet',
        `${ref}^{commit}`,
      ]);
    } catch {
      problems.push(`\`${ref}\` does not exist`);
      continue;
    }
    let base;
    try {
      base = String(await git(repoRoot, ['merge-base', 'HEAD', ref])).trim();
    } catch {
      problems.push(`\`${ref}\` shares no history with HEAD`);
      continue;
    }
    if (
      best === undefined ||
      (base !== best.base && (await isAncestor(repoRoot, best.base, base)))
    ) {
      best = { base, ref };
    }
  }
  if (best !== undefined) return best;
  throw new RunnerError(
    `The runner builds the CLI on top of a snapshot of HEAD's merge-base with ${refs.map(ref => `\`${ref}\``).join(' or ')}, but ${problems.join(' and ')}. Run \`git fetch origin main\` and retry.`,
    { hint: LOCAL_BUILD_HINT }
  );
}

/**
 * Throws RunnerError when the checkout has Git submodules: the patch can't
 * carry their changes and the base's archive leaves out their files, so the
 * runner would build something other than this checkout.
 */
async function refuseSubmodules(repoRoot) {
  const out = await git(repoRoot, ['ls-files', '--stage', '-z']);
  const submodules = submodulePaths(splitNul(out));
  if (submodules.length > 0) {
    throw new RunnerError(
      `The runner can't build a checkout with Git submodules (${submodules.join(', ')}): their changes and files would be left out.`,
      { hint: LOCAL_BUILD_HINT }
    );
  }
}

/**
 * What one run uploads on top of the snapshot of `base`:
 *   patch: `git diff --binary <base>` of the working tree (staged and
 *     unstaged changes, deletions, modes, binaries), empty when unchanged;
 *   untracked: the untracked files that aren't ignored, relative to the root;
 *   untrackedTarball: a gzip tarball of them, or undefined when there are none;
 *   nestedRepos: the untracked nested Git repositories left out, relative to
 *     the root;
 *   installNeeded: whether an install input differs from the base.
 *
 * Throws RunnerError when the checkout has submodules: the patch can't carry
 * their changes and the base's archive leaves out their files, so the runner
 * would build something other than this checkout.
 *
 * `git ls-files --others` lists an untracked nested repository as one
 * `dir/` entry rather than its files. Packing that entry would upload the
 * whole directory, its `.git` and ignored files included, so it is left out.
 */
export async function assembleRunPayload(repoRoot, base) {
  const diffOptions = [
    '--no-color',
    '--no-ext-diff',
    '--no-textconv',
    '--no-renames',
    '--no-relative',
    '--ignore-submodules',
  ];
  const [patch, changedOut, untrackedOut] = await Promise.all([
    git(repoRoot, [
      'diff',
      '--binary',
      // Zero-context patches from diff.context=0 need special apply flags.
      '--unified=3',
      ...diffOptions,
      '--src-prefix=a/',
      '--dst-prefix=b/',
      base,
    ]),
    git(repoRoot, ['diff', '--name-only', '-z', ...diffOptions, base]),
    git(repoRoot, ['ls-files', '--others', '--exclude-standard', '-z']),
    refuseSubmodules(repoRoot),
  ]);
  const { untracked, nestedRepos } = partitionUntracked(splitNul(untrackedOut));
  return {
    patch,
    untracked,
    untrackedTarball:
      untracked.length > 0
        ? await createTarball(repoRoot, untracked)
        : undefined,
    nestedRepos,
    installNeeded: installNeededFor({
      changed: splitNul(changedOut),
      untracked,
      patterns: workspacePatterns(repoRoot),
    }),
  };
}

/**
 * The tree of `base` for a snapshot build: `tarball` is
 * `git archive --format=tar.gz <base>`, `fileList` the NUL-separated
 * `git ls-tree -r --name-only -z <base>`, and `files` its length.
 *
 * The archive keeps LF line endings, as the patch has them: with
 * `core.autocrlf=true`, the Git for Windows default, `git archive` writes
 * CRLF files that the patch doesn't apply to.
 */
export async function baseArchive(repoRoot, base) {
  const [tarball, fileList] = await Promise.all([
    git(repoRoot, [
      '-c',
      'core.autocrlf=false',
      '-c',
      'core.eol=lf',
      'archive',
      '--format=tar.gz',
      base,
    ]),
    git(repoRoot, ['ls-tree', '-r', '--name-only', '-z', '--full-tree', base]),
  ]);
  return { tarball, fileList, files: splitNul(fileList).length };
}

/** The pnpm version in `base`'s root package.json, which the snapshot installs. */
export async function basePnpmVersion(repoRoot, base) {
  const packageJson = await git(repoRoot, ['show', `${base}:package.json`]);
  return parsePnpmVersion(String(packageJson));
}

/**
 * `{ channel, targets }` from `base`'s rust-toolchain.toml, which the
 * snapshot installs as the default toolchain so a build never downloads one.
 */
export async function baseRustToolchain(repoRoot, base) {
  const toml = await git(repoRoot, ['show', `${base}:${RUST_TOOLCHAIN_FILE}`]);
  return parseRustToolchain(String(toml));
}

/**
 * Upload one run's patch and untracked files. Returns `{ bytes, ms }`.
 */
async function uploadChanges(sandbox, payload) {
  const startedAt = Date.now();
  const dir = await stagingDir(sandbox);
  const files = [];
  if (payload.patch.length > 0) {
    files.push({ path: `${dir}/${RUN_PATCH}`, content: payload.patch });
  }
  if (payload.untrackedTarball) {
    files.push(
      {
        path: `${dir}/${RUN_UNTRACKED_TARBALL}`,
        content: payload.untrackedTarball,
      },
      {
        path: `${dir}/${RUN_UNTRACKED_LIST}`,
        content: payload.untracked.map(p => `${p}\0`).join(''),
      }
    );
  }
  if (files.length > 0) await sandbox.writeFiles(files);
  const bytes = payload.patch.length + (payload.untrackedTarball?.length ?? 0);
  return { bytes, ms: Date.now() - startedAt };
}

/**
 * Apply and commit the uploaded changes, install when needed, and build the
 * CLI. Pushes `apply`, `install` and `build` phases. Throws RunnerError when
 * a step fails.
 */
async function buildInRunner(sandbox, { payload, phases, log, signal }) {
  const where = `runner ${sandbox.name}`;
  const applyStartedAt = Date.now();
  await runChecked(sandbox, 'Applying the changes', 'bash', [
    '-lc',
    applyScript(await stagingDir(sandbox)),
  ]);
  phases.push(`apply ${secs(Date.now() - applyStartedAt)}`);
  signal.throwIfAborted();

  const streamed = async (prefix, label, title, stepScript) => {
    log(`${prefix} ${outputRule(`${title} from runner ${sandbox.name}`)}`);
    let outcome = 'failed';
    try {
      const ms = await runStep(sandbox, {
        label,
        where,
        script: stepScript,
        prefix,
        log,
        signal,
      });
      outcome = `done in ${secs(ms)}`;
      return ms;
    } finally {
      if (!signal.aborted) {
        log(`${prefix} ${outputRule(`end of ${title}: ${outcome}`)}`);
      }
    }
  };

  if (payload.installNeeded) {
    const ms = await streamed(
      '[runner install]',
      'pnpm install',
      'pnpm install output',
      INSTALL_SCRIPT
    );
    phases.push(`install ${secs(ms)}`);
  } else {
    phases.push('install skipped');
  }
  const ms = await streamed(
    '[runner build]',
    'The CLI build',
    'turbo build output',
    BUILD_SCRIPT
  );
  phases.push(`build ${secs(ms)}`);
}

/**
 * This mode as a BuildMode (see runner.mjs): the runner builds the CLI on top
 * of a snapshot of the merge-base, the newest main (or origin/main) commit
 * HEAD contains. Resolves the base and assembles the run's upload before any
 * sandbox starts, so a missing base or a checkout with submodules fails the
 * run without starting one; throws RunnerError for either.
 *
 * Its snapshot holds the toolchains, `base`'s tracked files in a git index,
 * `pnpm install` and a full CLI build in turbo's local cache. Each run
 * uploads the changes from `base`, then installs when needed and builds.
 */
export async function runnerBuildMode({ repoRoot }) {
  const { base, ref } = await resolveBase(repoRoot);
  const payload = await assembleRunPayload(repoRoot, base);
  const short = base.slice(0, 12);
  return {
    summary: `which builds the CLI from this checkout's changes on top of a build snapshot of the merge-base, the newest ${ref} commit your branch contains`,
    vcpus: buildRunnerVcpus,
    // The factory assembled the whole upload above.
    ready: Promise.resolve(),
    startedNote: ` (merge-base ${short} with ${ref})`,
    snapshot: {
      key: snapshotKey({ base, format: SNAPSHOT_FORMAT }),
      vcpus: SNAPSHOT_BUILD_VCPUS,
      missMessage: `No runner snapshot yet for merge-base ${short}, the newest ${ref} commit your branch contains. Building one remotely: toolchains, pnpm install and a full CLI build (${RUNNER_REGION}, ${RUNNER_RUNTIME}, ${SNAPSHOT_BUILD_VCPUS} vCPUs). It takes about 2–3 minutes, and happens again only when you rebase or restack onto a newer ${ref}; each run builds your branch's changes on top of it...`,
      builtFor: `merge-base ${short}`,
      entry: { base },
      begin({ log, prefix }) {
        // Pack the base's tree and read its versions while the sandbox starts.
        const archived = baseArchive(repoRoot, base);
        archived.catch(() => {});
        const versions = Promise.all([
          basePnpmVersion(repoRoot, base),
          baseRustToolchain(repoRoot, base),
        ]);
        versions.catch(() => {});
        return async (sandbox, step) => {
          const [{ tarball, fileList, files }, [pnpm, rust]] =
            await Promise.all([archived, versions]);
          const uploadStartedAt = Date.now();
          const dir = await stagingDir(sandbox);
          await sandbox.writeFiles([
            { path: `${dir}/${BASE_TARBALL}`, content: tarball },
            { path: `${dir}/${BASE_FILE_LIST}`, content: fileList },
          ]);
          log(
            `${prefix} ✓ Uploaded merge-base ${short} (${files} files, ${megabytes(tarball.length)}) in ${secs(Date.now() - uploadStartedAt)}`
          );
          await step(
            'Installing the toolchains',
            toolchainScript({ pnpm, rust })
          );
          await step('Committing the base tree', baseIndexScript(base, dir));
          await step('pnpm install', INSTALL_SCRIPT);
          await step('The CLI build', BUILD_SCRIPT);
        };
      },
    },
    async apply(sandbox, { phases, log, signal }) {
      if (payload.nestedRepos.length > 0) {
        log(
          `! [runner] Not uploading ${payload.nestedRepos.length === 1 ? 'an untracked nested Git repository' : 'untracked nested Git repositories'}: ${payload.nestedRepos.join(', ')}`
        );
      }
      const upload = await uploadChanges(sandbox, payload);
      phases.push(`upload ${megabytes(upload.bytes)} ${secs(upload.ms)}`);
      log(
        `✓ [runner] Uploaded the changes from ${short} (${megabytes(upload.bytes)}: a ${megabytes(payload.patch.length)} patch and ${untrackedSummary(payload.untracked)}) in ${secs(upload.ms)}`
      );
      signal.throwIfAborted();
      await buildInRunner(sandbox, { payload, phases, log, signal });
    },
  };
}
