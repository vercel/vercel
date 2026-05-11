import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';

const require = createRequire(import.meta.url);

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const stagingRoot = join(packageRoot, '.pkg-staging');
const pkgBin = require.resolve('@yao-pkg/pkg/lib-es5/bin.js');

const packageJson = JSON.parse(
  await fs.readFile(join(packageRoot, 'package.json'), 'utf8')
);
const binaryRuntimePackageNames = [
  '@vercel/blob',
  '@vercel/build-utils',
  '@vercel/cli-config',
  '@vercel/detect-agent',
  '@vercel/prepare-flags-definitions',
  'form-data',
  'jose',
  'luxon',
  'proxy-agent',
  'sandbox',
  'smol-toml',
  'zod',
];
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
await fs.writeFile(
  join(stagingRoot, 'package.json'),
  JSON.stringify(
    {
      name: packageJson.name,
      version: packageJson.version,
      type: packageJson.type,
      dependencies: binaryRuntimeDependencies,
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

const args = normalizeOutputArgs(process.argv.slice(2));
const child = spawn(
  process.execPath,
  [pkgBin, './pkg.js', '--config', './pkg.config.mjs', ...args],
  {
    cwd: stagingRoot,
    env: {
      ...process.env,
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

async function stagePackage(name, issuerDir = packageRoot, scan = true) {
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

  for (const [dependency, version] of Object.entries(dependencies)) {
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

  const [firstSegment] = packageRelativePath.split('/');
  const ignored = new Set([
    '.git',
    '.turbo',
    'coverage',
    'node_modules',
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
