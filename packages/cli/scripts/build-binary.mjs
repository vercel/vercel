// Builds the native `vercel` binary with @yao-pkg/pkg.
//
// The binary snapshot needs a real, correctly nested `node_modules` tree for
// every runtime dependency of the CLI bundle. Instead of hand-flattening
// packages (which broke when two packages needed different versions of the
// same dependency), this script lets pnpm materialize the tree straight from
// `pnpm-lock.yaml` and then trims it to what the binary can reach:
//
//   1. `pnpm deploy --frozen-lockfile` with `node-linker=hoisted` writes a
//      classic nested `node_modules` (no symlinks, no virtual store) for the
//      CLI package using exactly the versions in the lockfile. Workspace
//      packages are copied in as their published file set. Production and
//      selected native-only devDependencies (`@vltpkg/*`) are both present
//      before prune; `--prod` would drop the vlt importer packages.
//   2. Builders (`package.json#builders`) are installed at runtime via
//      importBuilders and must never ship in the binary. The tree is pruned
//      to packages reachable from non-builder runtime deps plus the native
//      vlt importer using Node resolution.
//   3. pkg snapshots `dist/` plus the pruned `node_modules/`.
//
// Staging lives outside the repository on purpose. pkg follows `require()`
// calls from every snapshotted file, and Node resolution walks up parent
// directories, so a staging dir inside the repo lets stray requires (for
// example a dependency's shipped `*.test.js` requiring `vitest`) resolve into
// the workspace `node_modules` and silently double the binary size.
import { execFile, spawn } from 'node:child_process';
import { builtinModules, createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import { promisify } from 'node:util';

const require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const workspaceRoot = resolve(packageRoot, '..', '..');
// On GitHub Actions prefer RUNNER_TEMP over os.tmpdir(): on Windows runners
// the checkout is on D: while TEMP is on C: (as an 8.3 short path), and pnpm
// hardlinks from a per-drive store, so a cross-drive deploy target fails.
const stagingRoot =
  process.env.VERCEL_CLI_BINARY_STAGING_DIR ??
  join(process.env.RUNNER_TEMP || tmpdir(), 'vercel-cli-binary-staging');
const stagedNodeModules = join(stagingRoot, 'node_modules');

/**
 * Split the CLI's `dependencies` into the packages the binary must ship
 * (runtime) and the ones it must not (`package.json#builders`).
 */
export function getRuntimeDependencies(packageJson) {
  const builders = new Set(Object.keys(packageJson.builders ?? {}));
  const runtime = {};
  for (const [name, spec] of Object.entries(packageJson.dependencies ?? {})) {
    if (builders.has(name)) continue;
    runtime[name] = spec;
  }
  return { runtime, builders };
}

// Native-only packages. They stay in devDependencies so the npm CLI (Node 20)
// never loads `node:sqlite` via `@vltpkg/graph`. The binary still stages them.
const BINARY_ONLY_DEPENDENCIES = [
  '@vltpkg/graph',
  '@vltpkg/package-info',
  '@vltpkg/package-json',
  'path-scurry',
];

export function getBinaryOnlyDependencies(packageJson) {
  const extra = {};
  for (const name of BINARY_ONLY_DEPENDENCIES) {
    const spec =
      packageJson.devDependencies?.[name] ?? packageJson.dependencies?.[name];
    if (!spec) {
      throw new Error(
        `Binary build aborted: "${name}" is not declared in dependencies or devDependencies.`
      );
    }
    extra[name] = spec;
  }
  return extra;
}

/**
 * Map a pkg target such as `node24.14.1-linux-x64` to Node's
 * `process.platform` / `process.arch` values. Returns `null` for `host` or
 * unrecognised targets.
 */
export function platformForTarget(target) {
  if (!target || target === 'host') return null;
  const match = target.match(
    /^node[\d.]*-(?<platform>[a-z]+)-(?<arch>[a-z0-9]+)$/
  );
  if (!match) return null;
  const osMap = { linux: 'linux', macos: 'darwin', win: 'win32' };
  const os = osMap[match.groups.platform];
  if (!os) return null;
  return { os, cpu: match.groups.arch };
}

/**
 * pnpm resolves platform-specific optional dependencies (esbuild binaries,
 * @napi-rs/keyring) for the machine it runs on; the only override is
 * `supportedArchitectures` in pnpm-workspace.yaml, which would change the
 * whole repo's install. So the binary must be built on a host matching the
 * target. Throws when they differ instead of producing a binary whose native
 * modules will not load.
 */
export function assertTargetsMatchHost(
  targets,
  host = { os: process.platform, cpu: process.arch }
) {
  for (const target of targets) {
    const platform = platformForTarget(target);
    if (!platform) continue;
    if (platform.os !== host.os || platform.cpu !== host.cpu) {
      throw new Error(
        `Binary target ${target} (${platform.os}-${platform.cpu}) does not ` +
          `match the build host (${host.os}-${host.cpu}). Platform-specific ` +
          `dependencies are resolved for the host, so the binary must be ` +
          `built on a ${platform.os}-${platform.cpu} machine.`
      );
    }
  }
}

/**
 * Compute the set of package directories reachable from `entryPackages`
 * inside a classic (hoisted, symlink-free) `node_modules` tree using Node's
 * resolution rules: look in `<dir>/node_modules/<name>`, then walk up until
 * `root`. `dependencies` and `optionalDependencies` are followed;
 * `skip` names (the builders) are never followed. Returns the kept absolute
 * package directories and the names that failed to resolve.
 */
export async function collectReachablePackages({
  root,
  entryPackages,
  skip = new Set(),
}) {
  const keep = new Set();
  const unresolved = [];

  async function resolvePackageDir(name, fromDir) {
    let dir = fromDir;
    for (;;) {
      const candidate = join(dir, 'node_modules', ...name.split('/'));
      if (await exists(join(candidate, 'package.json'))) return candidate;
      if (dir === root) return null;
      const parent = dirname(dir);
      if (parent === dir || !dir.startsWith(root)) return null;
      dir = parent;
    }
  }

  async function visit(packageDir) {
    if (keep.has(packageDir)) return;
    keep.add(packageDir);
    const manifest = JSON.parse(
      await fs.readFile(join(packageDir, 'package.json'), 'utf8')
    );
    const dependencies = {
      ...manifest.dependencies,
      ...manifest.optionalDependencies,
    };
    for (const name of Object.keys(dependencies)) {
      if (skip.has(name)) continue;
      const resolved = await resolvePackageDir(name, packageDir);
      if (resolved) {
        await visit(resolved);
      } else if (!manifest.optionalDependencies?.[name]) {
        const from = relative(root, packageDir).split(sep).join('/');
        unresolved.push(`${name} (from ${from})`);
      }
    }
  }

  for (const name of entryPackages) {
    const resolved = await resolvePackageDir(name, root);
    if (!resolved) {
      throw new Error(
        `Runtime dependency "${name}" is not installed in ${root}/node_modules`
      );
    }
    await visit(resolved);
  }

  return { keep, unresolved };
}

/**
 * Delete every package directory under `nodeModulesDir` (recursively) that is
 * not in `keep`, along with `.bin` and other dot-entries pnpm leaves behind.
 * Returns the number of packages removed.
 */
export async function pruneNodeModules(nodeModulesDir, keep) {
  let removed = 0;

  async function handlePackage(packageDir) {
    if (!(await exists(join(packageDir, 'package.json')))) return;
    if (!keep.has(packageDir)) {
      await fs.rm(packageDir, { recursive: true, force: true });
      removed += 1;
      return;
    }
    await sweep(join(packageDir, 'node_modules'));
  }

  async function sweep(dir) {
    if (!(await exists(dir))) return;
    for (const entry of await fs.readdir(dir)) {
      const full = join(dir, entry);
      if (entry.startsWith('.')) {
        await fs.rm(full, { recursive: true, force: true });
      } else if (entry.startsWith('@')) {
        for (const scoped of await fs.readdir(full)) {
          await handlePackage(join(full, scoped));
        }
        if ((await fs.readdir(full)).length === 0) await fs.rmdir(full);
      } else {
        await handlePackage(full);
      }
    }
  }

  await sweep(nodeModulesDir);
  return removed;
}

async function exists(path) {
  try {
    await fs.stat(path);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const packageJson = JSON.parse(
    await fs.readFile(join(packageRoot, 'package.json'), 'utf8')
  );
  const {
    getWorkspaceVersions,
    pinBuilders,
    getBuildUtilsSpec,
    previewTarballFilename,
  } = await import('./pin-builders.mjs');
  const { generateBuilderGraphs, writeCompressedBuilderGraphs } = await import(
    './generate-builder-graph.mjs'
  );
  const { runtime, builders } = getRuntimeDependencies(packageJson);
  const binaryOnly = getBinaryOnlyDependencies(packageJson);

  const args = normalizeOutputArgs(process.argv.slice(2));
  assertTargetsMatchHost(getTargets(args));

  await fs.rm(stagingRoot, { recursive: true, force: true });
  await pnpmDeploy();

  // pnpm deploy copies the CLI package's own files too; replace them with the
  // freshly built dist and the pkg entry files so staging only contains what
  // the snapshot needs.
  for (const entry of await fs.readdir(stagingRoot)) {
    if (entry === 'node_modules') continue;
    await fs.rm(join(stagingRoot, entry), { recursive: true, force: true });
  }
  await fs.cp(join(packageRoot, 'dist'), join(stagingRoot, 'dist'), {
    recursive: true,
  });
  await fs.copyFile(join(packageRoot, 'pkg.js'), join(stagingRoot, 'pkg.js'));
  await fs.copyFile(
    join(packageRoot, 'pkg.config.mjs'),
    join(stagingRoot, 'pkg.config.mjs')
  );

  // Pin the `builders` manifest to exact workspace versions (or keep
  // pre-rewritten entries like preview tarball URLs from utils/pack.ts).
  // getBuilderPins() reads this manifest at runtime via getPackageJSON(),
  // which resolves to this staged package.json inside the binary — without
  // it, importBuilders installs unpinned builders from npm `latest`.
  const workspaceVersions = getWorkspaceVersions(join(packageRoot, '..'));
  const { builders: pinnedBuilders } = pinBuilders(
    packageJson,
    workspaceVersions,
    process.env.VERCEL_CLI_PREVIEW_TARBALL_BASE_URL
  );
  const previewTarballBaseUrl =
    process.env.VERCEL_CLI_PREVIEW_TARBALL_BASE_URL?.replace(/\/$/, '');
  const buildUtilsSpec = previewTarballBaseUrl
    ? `${previewTarballBaseUrl}/${previewTarballFilename('@vercel/build-utils')}`
    : getBuildUtilsSpec(packageJson, workspaceVersions);
  const builderGraphs = await generateBuilderGraphs(pinnedBuilders, {
    buildUtilsSpec,
  });
  await writeCompressedBuilderGraphs(
    join(stagingRoot, 'dist/builders/builder-graph.json.br'),
    builderGraphs
  );
  await writeJson(join(stagingRoot, 'package.json'), {
    name: packageJson.name,
    version: packageJson.version,
    type: packageJson.type,
    private: true,
    dependencies: { ...runtime, ...binaryOnly },
    builders: pinnedBuilders,
  });

  // Trim the deployed tree to what the runtime deps can actually reach. This
  // drops the builders and anything only they depend on, while keeping the
  // native-only vlt importer and its graph.
  const { keep, unresolved } = await collectReachablePackages({
    root: stagingRoot,
    entryPackages: [...Object.keys(runtime), ...Object.keys(binaryOnly)],
    skip: builders,
  });
  if (unresolved.length > 0) {
    throw new Error(
      `Binary build aborted: ${unresolved.length} required dependency(ies) ` +
        `could not be resolved in the staged node_modules:\n` +
        unresolved.map(entry => `  - ${entry}`).join('\n')
    );
  }
  const removed = await pruneNodeModules(stagedNodeModules, keep);
  console.log(
    `Pruned staging: kept ${keep.size} reachable package(s), removed ${removed}.`
  );

  await assertNoBuildersStaged(builders);
  await verifyExternalImportsAreStaged(packageJson, builders);

  const customNodeRuntimeEnv = await seedCustomNodeRuntime(args);
  const pkgBin = require.resolve('@yao-pkg/pkg/lib-es5/bin.js');
  const child = spawn(
    process.execPath,
    [pkgBin, './pkg.js', '--config', './pkg.config.mjs', ...args],
    {
      cwd: stagingRoot,
      env: {
        ...process.env,
        ...customNodeRuntimeEnv,
        VERCEL_CLI_BINARY_OUTPUT_DIR: join(packageRoot, 'dist-bin'),
      },
      stdio: 'inherit',
    }
  );

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
}

/**
 * Materialize the CLI's dependency tree from `pnpm-lock.yaml` into the
 * staging directory as a classic hoisted `node_modules`.
 *
 * `--frozen-lockfile` guarantees the binary ships exactly the versions the
 * repo has locked. DevDependencies are included so native-only packages
 * (`@vltpkg/*`) can be staged; prune later drops everything the binary
 * cannot reach. `node-linker=hoisted` and `inject-workspace-packages` are
 * passed as per-invocation config so the normal workspace install is not
 * affected.
 */
async function pnpmDeploy() {
  console.log(
    `Deploying binary runtime dependencies for ${process.platform}-${process.arch} from pnpm-lock.yaml...`
  );
  await runTool(
    'pnpm',
    [
      '--filter',
      'vercel',
      'deploy',
      '--frozen-lockfile',
      '--ignore-scripts',
      '--config.node-linker=hoisted',
      '--config.inject-workspace-packages=true',
      stagingRoot,
    ],
    { cwd: workspaceRoot, quiet: true }
  );
}

/**
 * Run a CLI tool. With `quiet`, its output is buffered instead of streamed
 * and only replayed when the tool fails, so a failing step is always
 * diagnosable from the build log (pnpm reports errors on stdout).
 */
function runTool(command, args, { cwd, quiet = false }) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ['ignore', quiet ? 'pipe' : 'inherit', quiet ? 'pipe' : 'inherit'],
      // pnpm is a `.cmd` shim on Windows.
      shell: process.platform === 'win32',
    });
    const output = [];
    child.stdout?.on('data', chunk => output.push(chunk));
    child.stderr?.on('data', chunk => output.push(chunk));
    child.on('error', reject);
    child.on('exit', code => {
      if (code === 0) {
        resolvePromise();
        return;
      }
      const captured = Buffer.concat(output).toString('utf8').trim();
      reject(
        new Error(
          `${command} ${args.join(' ')} exited with code ${code}` +
            (captured ? `\n${captured}` : '')
        )
      );
    });
  });
}

async function assertNoBuildersStaged(builders) {
  const staged = [];
  for (const name of builders) {
    try {
      await fs.stat(
        join(stagedNodeModules, ...name.split('/'), 'package.json')
      );
      staged.push(name);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  if (staged.length > 0) {
    throw new Error(
      `Binary build aborted: builder package(s) from package.json#builders ` +
        `were staged into the native binary:\n` +
        staged
          .sort()
          .map(name => `  - ${name}`)
          .join('\n') +
        `\n\nBuilders must be loaded at runtime via importBuilders.`
    );
  }
  console.log(
    `Staging check: no package.json#builders packages are present in the binary staging tree.`
  );
}

/**
 * Every bare specifier the bundle imports must either be a Node builtin or
 * resolve from the staged node_modules. This catches dependencies that are
 * imported but missing from `package.json#dependencies`.
 */
async function verifyExternalImportsAreStaged(packageJson, builders) {
  const files = [];
  const walk = async dir => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
      } else if (/\.(?:js|mjs|cjs)$/.test(entry.name)) {
        files.push(full);
      }
    }
  };
  await walk(join(stagingRoot, 'dist'));

  const specifierRe =
    /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)["']([^"'\s$]+)["']/g;
  const builtins = new Set(builtinModules);
  const imported = new Set();
  for (const file of files) {
    const content = await fs.readFile(file, 'utf8');
    for (const match of content.matchAll(specifierRe)) {
      const specifier = match[1];
      if (specifier.startsWith('.') || specifier.startsWith('/')) continue;
      if (specifier.startsWith('node:')) continue;
      const segments = specifier.split('/');
      const packageName = specifier.startsWith('@')
        ? segments.slice(0, 2).join('/')
        : segments[0];
      if (!packageName || builtins.has(packageName)) continue;
      imported.add(packageName);
    }
  }

  const importedBuilders = [...imported].filter(name => builders.has(name));
  if (importedBuilders.length > 0) {
    throw new Error(
      `Binary build aborted: the CLI bundle statically imports builder ` +
        `package(s) from package.json#builders. Builders must be loaded via ` +
        `importBuilders at runtime, not bundled into the native binary:\n` +
        importedBuilders
          .sort()
          .map(name => `  - ${name}`)
          .join('\n')
    );
  }

  const declared = new Set(Object.keys(packageJson.dependencies ?? {}));
  const missing = [];
  for (const packageName of imported) {
    // Only check names that look like real packages the bundle left external.
    // esbuild leaves `dependencies` external; anything else is bundled and the
    // regex may match string literals that are not imports.
    if (!declared.has(packageName)) continue;
    try {
      await fs.stat(
        join(stagedNodeModules, ...packageName.split('/'), 'package.json')
      );
    } catch {
      missing.push(packageName);
    }
  }
  if (missing.length > 0) {
    throw new Error(
      `Binary build aborted: ${missing.length} dependency(ies) are statically ` +
        `imported by the bundle but were not installed into the binary:\n` +
        missing
          .sort()
          .map(name => `  - ${name}`)
          .join('\n')
    );
  }

  console.log(
    `Static check: all ${imported.size} statically-imported dependencies are staged into the binary` +
      (builders.size ? ` (${builders.size} builders excluded)` : '') +
      `.`
  );
}

async function writeJson(path, value) {
  await fs.writeFile(path, JSON.stringify(value, null, 2) + '\n');
}

function normalizeOutputArgs(args) {
  const outputFlags = new Set([
    '--output',
    '-o',
    '--out-path',
    '--output-path',
  ]);
  const normalized = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const equalsIndex = arg.indexOf('=');
    const flag = equalsIndex === -1 ? arg : arg.slice(0, equalsIndex);

    if (outputFlags.has(flag)) {
      if (equalsIndex === -1) {
        normalized.push(arg, normalizeFromPackageRoot(args[index + 1]));
        index += 1;
      } else {
        normalized.push(
          flag + '=' + normalizeFromPackageRoot(arg.slice(equalsIndex + 1))
        );
      }
      continue;
    }

    normalized.push(arg);
  }

  return normalized;
}

function normalizeFromPackageRoot(path) {
  if (!path || isAbsolute(path)) {
    return path;
  }
  return resolve(packageRoot, path);
}

async function seedCustomNodeRuntime(args) {
  const customNodePath = process.env.VERCEL_CLI_BINARY_NODE_PATH;

  if (!customNodePath) {
    return {};
  }

  const target = getSingleTarget(args);
  if (!target) {
    throw new Error(
      'VERCEL_CLI_BINARY_NODE_PATH requires a single explicit --target value'
    );
  }

  const parsedTarget = parseExactNodeTarget(target);
  if (!parsedTarget) {
    throw new Error(
      `VERCEL_CLI_BINARY_NODE_PATH requires an exact Node patch target, got "${target}"`
    );
  }

  const resolvedNodePath = normalizeFromPackageRoot(customNodePath);
  const { stdout } = await execFileAsync(resolvedNodePath, ['--version']);
  const nodeVersion = stdout.trim();
  const expectedVersion = `v${parsedTarget.version}`;

  if (nodeVersion !== expectedVersion) {
    throw new Error(
      `Custom Node runtime version mismatch: expected ${expectedVersion}, got ${nodeVersion}`
    );
  }

  const nodeOs = nodeOsForTargetPlatform(parsedTarget.platform);
  const cacheHome = process.env.VERCEL_CLI_BINARY_NODE_CACHE_HOME
    ? normalizeFromPackageRoot(process.env.VERCEL_CLI_BINARY_NODE_CACHE_HOME)
    : join(packageRoot, '.node-runtime', 'pkg-home');
  const cacheDir = join(cacheHome, '.pkg-cache', 'sea');
  const nodeDirName = `node-${expectedVersion}-${nodeOs}-${parsedTarget.arch}`;
  const cacheNodePath =
    nodeOs === 'win'
      ? join(cacheDir, `${nodeDirName}.exe`)
      : join(cacheDir, nodeDirName, 'bin', 'node');
  const archivePath = join(
    cacheDir,
    `${nodeDirName}.${nodeOs === 'win' ? 'zip' : 'tar.gz'}`
  );

  await fs.mkdir(dirname(cacheNodePath), { recursive: true });
  await fs.copyFile(resolvedNodePath, cacheNodePath);
  await fs.chmod(cacheNodePath, 0o755);
  await fs.writeFile(`${cacheNodePath}.ok`, '');
  await fs.writeFile(archivePath, '');
  await fs.writeFile(`${archivePath}.ok`, '');

  console.log(
    `Seeded yao-pkg SEA cache with custom Node runtime for ${target}: ${resolvedNodePath}`
  );

  return { HOME: cacheHome, USERPROFILE: cacheHome };
}

/** All `--target` values, split on commas (pkg accepts `a,b,c`). */
export function getTargets(args) {
  const target = getSingleTarget(args);
  if (!target) return [];
  return target
    .split(',')
    .map(value => value.trim())
    .filter(Boolean);
}

function getSingleTarget(args) {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--target' || arg === '-t') {
      return args[index + 1];
    }

    if (arg.startsWith('--target=')) {
      return arg.slice('--target='.length);
    }
  }
}

function parseExactNodeTarget(target) {
  const match = target.match(
    /^node(?<version>\d+\.\d+\.\d+)-(?<platform>[^-]+)-(?<arch>[^-]+)$/
  );

  return match?.groups;
}

function nodeOsForTargetPlatform(targetPlatform) {
  if (targetPlatform === 'macos') {
    return 'darwin';
  }

  if (targetPlatform === 'linux' || targetPlatform === 'win') {
    return targetPlatform;
  }

  throw new Error(`Unsupported custom Node target platform: ${targetPlatform}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.message ?? error);
    process.exit(1);
  });
}
