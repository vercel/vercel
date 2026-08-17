import { execFile, spawn } from 'node:child_process';
import { builtinModules, createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import { promisify } from 'node:util';

const require = createRequire(import.meta.url);
const execFileAsync = promisify(execFile);
const { getWorkspaceVersions, pinBuilders } = await import(
  './pin-builders.mjs'
);

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stagingRoot = join(packageRoot, '.pkg-staging');
const pkgBin = require.resolve('@yao-pkg/pkg/lib-es5/bin.js');

const packageJson = JSON.parse(
  await fs.readFile(join(packageRoot, 'package.json'), 'utf8')
);
// `package.json#builders` are loaded via importBuilders — never stage them.
const builderPackageNames = new Set(
  Object.keys(packageJson.builders ?? {}).filter(
    name => typeof name === 'string' && name.length > 0
  )
);
const binaryRuntimePackageNames = [
  '@vercel/blob',
  '@vercel/build-utils',
  '@vercel/cli-auth',
  '@vercel/cli-config',
  '@vercel/detect-agent',
  '@vercel/fun',
  '@vercel/prepare-flags-definitions',
  '@vercel/python-analysis',
  'chokidar',
  'esbuild',
  'jose',
  'luxon',
  'sandbox',
  'smol-toml',
  'undici',
  'uuid',
  'zod',
];
for (const name of binaryRuntimePackageNames) {
  if (builderPackageNames.has(name)) {
    throw new Error(
      `Binary build aborted: "${name}" is listed in both ` +
        `binaryRuntimePackageNames and package.json#builders. Builders must ` +
        `not be staged into the native binary.`
    );
  }
}
const binaryRuntimeDevDependencies = new Map([
  [
    '@vercel/build-utils',
    [
      'async-retry',
      'async-sema',
      'bytes',
      'cross-spawn',
      'end-of-stream',
      'fs-extra',
      'glob',
      'ignore',
      'into-stream',
      'js-yaml',
      'json5',
      'mime-types',
      'minimatch',
      'multistream',
      'semver',
      'yazl',
    ],
  ],
]);
const binaryRuntimeDependencies = Object.fromEntries(
  binaryRuntimePackageNames.map(name => [name, packageJson.dependencies[name]])
);

await fs.rm(stagingRoot, { recursive: true, force: true });
await fs.mkdir(stagingRoot, { recursive: true });

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
// pinBuilders throws if any entry cannot be pinned exactly, failing the
// binary build rather than shipping unpinned builders.
const { builders: pinnedBuilders } = pinBuilders(
  packageJson,
  getWorkspaceVersions(join(packageRoot, '..')),
  process.env.VERCEL_CLI_PREVIEW_TARBALL_BASE_URL
);

await fs.writeFile(
  join(stagingRoot, 'package.json'),
  JSON.stringify(
    {
      name: packageJson.name,
      version: packageJson.version,
      type: packageJson.type,
      dependencies: binaryRuntimeDependencies,
      builders: pinnedBuilders,
    },
    null,
    2
  ) + String.fromCharCode(10)
);

const staged = new Set();
const scanned = new Set();
const stagedNodeModules = join(stagingRoot, 'node_modules');
const directDependencies = binaryRuntimePackageNames;

for (const dependency of directDependencies) {
  await stagePackage(dependency, packageRoot, false);
}

for (const dependency of directDependencies) {
  await scanPackage(dependency, packageRoot);
}

const STATIC_CHECK_IGNORE = new Set([]);

await verifyExternalImportsAreStaged();
await assertNoBuildersStaged();

const args = normalizeOutputArgs(process.argv.slice(2));
const customNodeRuntimeEnv = await seedCustomNodeRuntime(args);
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

async function verifyExternalImportsAreStaged() {
  const distDir = join(stagingRoot, 'dist');
  const declaredDependencies = new Set(
    Object.keys(packageJson.dependencies ?? {})
  );

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
  await walk(distDir);

  const specifierRe =
    /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)["']([^"']+)["']/g;
  const builtins = new Set(builtinModules);
  const imported = new Set();

  for (const file of files) {
    const content = await fs.readFile(file, 'utf8');
    let match;
    while ((match = specifierRe.exec(content)) !== null) {
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

  const importedBuilders = [...imported]
    .filter(name => builderPackageNames.has(name))
    .sort();
  if (importedBuilders.length > 0) {
    throw new Error(
      `Binary build aborted: the CLI bundle statically imports builder ` +
        `package(s) from package.json#builders. Builders must be loaded via ` +
        `importBuilders at runtime, not bundled into the native binary:\n` +
        importedBuilders.map(name => `  - ${name}`).join('\n')
    );
  }

  const missing = [];
  for (const packageName of imported) {
    if (STATIC_CHECK_IGNORE.has(packageName)) continue;
    if (builderPackageNames.has(packageName)) continue;
    if (!declaredDependencies.has(packageName)) continue;
    const manifest = join(
      stagedNodeModules,
      ...packageName.split('/'),
      'package.json'
    );
    try {
      await fs.stat(manifest);
    } catch {
      missing.push(packageName);
    }
  }

  if (missing.length > 0) {
    missing.sort();
    throw new Error(
      `Binary build aborted: ${missing.length} dependency(ies) are statically ` +
        `imported by the bundle but were not staged into the binary:\n` +
        missing.map(name => `  - ${name}`).join('\n') +
        `\n\nAdd them to binaryRuntimePackageNames in scripts/build-binary.mjs ` +
        `(or to STATIC_CHECK_IGNORE if intentionally excluded). Releasing this ` +
        `binary would crash at runtime with ERR_MODULE_NOT_FOUND.`
    );
  }

  console.log(
    `Static check: all ${imported.size} statically-imported dependencies are staged into the binary` +
      (builderPackageNames.size
        ? ` (${builderPackageNames.size} builders excluded)`
        : '') +
      `.`
  );
}

async function assertNoBuildersStaged() {
  const stagedBuilders = [];
  for (const name of builderPackageNames) {
    const manifest = join(
      stagedNodeModules,
      ...name.split('/'),
      'package.json'
    );
    try {
      await fs.stat(manifest);
      stagedBuilders.push(name);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }
  if (stagedBuilders.length > 0) {
    stagedBuilders.sort();
    throw new Error(
      `Binary build aborted: builder package(s) from package.json#builders ` +
        `were staged into the native binary:\n` +
        stagedBuilders.map(name => `  - ${name}`).join('\n') +
        `\n\nBuilders must be loaded at runtime via importBuilders.`
    );
  }
  console.log(
    `Staging check: no package.json#builders packages are present in the binary staging tree.`
  );
}

async function stagePackage(name, issuerDir = packageRoot, scan = true) {
  if (builderPackageNames.has(name)) {
    throw new Error(
      `Refusing to stage builder package "${name}" into the native binary. ` +
        `Packages listed in package.json#builders are loaded via importBuilders.`
    );
  }

  const packageDir = await findPackageDir(name, issuerDir);
  const destination = join(stagedNodeModules, ...name.split('/'));

  if (!staged.has(name)) {
    staged.add(name);
    await copyPackage(packageDir, destination);
  }

  if (scan) {
    await scanPackage(name, issuerDir);
  }

  return packageDir;
}

async function scanPackage(name, issuerDir = packageRoot) {
  const packageDir = await findPackageDir(name, issuerDir);
  const scanKey = name + '\0' + packageDir;

  if (scanned.has(scanKey)) {
    return;
  }
  scanned.add(scanKey);

  const manifest = JSON.parse(
    await fs.readFile(join(packageDir, 'package.json'), 'utf8')
  );
  const dependencies = {
    ...manifest.dependencies,
    ...manifest.optionalDependencies,
  };
  const devDependencies = binaryRuntimeDevDependencies.get(name) ?? [];

  for (const dependency of devDependencies) {
    if (manifest.devDependencies?.[dependency]) {
      dependencies[dependency] = manifest.devDependencies[dependency];
    }
  }

  for (const [dependency, version] of Object.entries(dependencies)) {
    if (builderPackageNames.has(dependency)) {
      continue;
    }
    try {
      await stagePackage(dependency, packageDir);
    } catch (error) {
      if (manifest.optionalDependencies?.[dependency] === version) {
        continue;
      }
      throw error;
    }
  }
}

async function findPackageDir(name, issuerDir) {
  let current = issuerDir;

  while (true) {
    const candidate = join(current, 'node_modules', ...name.split('/'));
    try {
      const stat = await fs.stat(join(candidate, 'package.json'));
      if (stat.isFile()) {
        return await fs.realpath(candidate);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    const parent = dirname(current);
    if (parent === current) {
      throw new Error(
        'Could not resolve package ' + name + ' from ' + issuerDir
      );
    }
    current = parent;
  }
}

async function copyPackage(source, destination) {
  await fs.mkdir(dirname(destination), { recursive: true });
  await fs.cp(source, destination, {
    recursive: true,
    dereference: true,
    filter: sourcePath => shouldCopyPackagePath(source, sourcePath),
  });
}

function shouldCopyPackagePath(packageDir, sourcePath) {
  const packageRelativePath = relative(packageDir, sourcePath);
  if (!packageRelativePath) {
    return true;
  }

  const filename = packageRelativePath.split('/').at(-1);
  const ignoredExtensions = ['.d.cts', '.d.mts', '.d.ts', '.map'];

  if (ignoredExtensions.some(extension => filename.endsWith(extension))) {
    return false;
  }

  if (/\.(spec|test)\.(cjs|js|mjs)$/.test(filename)) {
    return false;
  }

  const [firstSegment] = packageRelativePath.split('/');
  const ignored = new Set([
    '.git',
    '.turbo',
    'bench',
    'benchmark',
    'coverage',
    'doc',
    'docs',
    'example',
    'examples',
    'node_modules',
    'scripts',
    'target',
    'test',
    'tests',
  ]);

  if (isWorkspacePackage(packageDir)) {
    ignored.add('src');
  }

  return !ignored.has(firstSegment);
}

function isWorkspacePackage(packageDir) {
  const relativePackagePath = relative(
    resolve(packageRoot, '..', '..'),
    packageDir
  );
  return (
    relativePackagePath.startsWith('packages/') ||
    relativePackagePath.startsWith('internals/')
  );
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
