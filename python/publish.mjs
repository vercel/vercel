/**
 * Publish Python packages on PyPI.
 *
 * This script is used by:
 *   - `pnpm ci:publish` via `utils/publish-runtimes.mjs`
 *   - `.github/workflows/release-python-package.yml`
 *
 * Add new entries to `PYTHON_PACKAGES` to onboard additional Python packages.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const PYTHON_PACKAGES = [
  {
    name: 'vercel-workers',
    projectDir: 'python/vercel-workers',
    versionPin: {
      path: 'packages/python/src/workers-version.ts',
      exportName: 'VERCEL_WORKERS_VERSION',
    },
    uvRunGroupArgs: ['--group=test'],
    pytestArgs: ['-v', '--tb=short', '-k', 'not test_cqa_'],
  },
  {
    name: 'vercel-runtime',
    projectDir: 'python/vercel-runtime',
    versionPin: {
      path: 'packages/python/src/runtime-version.ts',
      exportName: 'VERCEL_RUNTIME_VERSION',
    },
    uvRunGroupArgs: ['--only-group=test'],
    pytestArgs: ['-k', 'not test_cqa_'],
  },
].map(pkg => ({
  ...pkg,
  pyprojectPath: `${pkg.projectDir}/pyproject.toml`,
  distDir: `${pkg.projectDir}/dist`,
  testsPath: `${pkg.projectDir}/tests`,
}));
const PYTHON_PACKAGE_NAMES = PYTHON_PACKAGES.map(pkg => pkg.name);

const pythonPackageMap = new Map(PYTHON_PACKAGES.map(pkg => [pkg.name, pkg]));

class UsageError extends Error {}

function parseVersion(tomlContent) {
  const match = tomlContent.match(/^version\s*=\s*"([^"]+)"/m);
  if (!match) {
    throw new Error('Could not parse version from pyproject.toml');
  }
  return match[1];
}

function parseArgs(argv) {
  let force = false;
  const requestedPackages = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--force') {
      force = true;
      continue;
    }

    if (arg === '--package') {
      const nextArg = argv[++i];
      if (!nextArg) {
        throw new UsageError('Missing value for --package');
      }
      requestedPackages.push(nextArg);
      continue;
    }

    if (arg.startsWith('--package=')) {
      requestedPackages.push(arg.slice('--package='.length));
      continue;
    }

    if (arg === '-h' || arg === '--help') {
      printUsage();
      process.exit(0);
    }

    throw new UsageError(`Unknown argument: ${arg}`);
  }

  const packageNames =
    requestedPackages.length === 0 || requestedPackages.includes('all')
      ? PYTHON_PACKAGE_NAMES
      : [...new Set(requestedPackages)];

  const unknown = packageNames.filter(name => !pythonPackageMap.has(name));
  if (unknown.length > 0) {
    throw new UsageError(
      `Unknown package(s): ${unknown.join(', ')}. Valid options: all, ${PYTHON_PACKAGE_NAMES.join(', ')}`
    );
  }

  return { force, packageNames };
}

function printUsage() {
  console.log(`Usage: node python/publish.mjs [--package <name>|all] [--force]

Options:
  --package <name>   Publish only one package (repeatable).
  --package=all      Publish all configured packages (default).
  --force            Publish even if version has not changed vs HEAD^.

Known packages:
  ${PYTHON_PACKAGE_NAMES.join('\n  ')}
`);
}

function run(cmd, args) {
  const cmdline = `${cmd} ${args.join(' ')}`;
  console.log(`$ ${cmdline}`);
  try {
    execFileSync(cmd, args, { stdio: 'inherit', cwd: root });
  } catch (err) {
    const code = err.status ?? 1;
    console.error(`command failed with exit code ${code}: ${cmdline}`);
    process.exit(code);
  }
}

function assertVersionPin(pkg, currentVersion) {
  if (!pkg.versionPin) {
    return;
  }

  const versionPinPath = resolve(root, pkg.versionPin.path);
  const pinnedContent = readFileSync(versionPinPath, 'utf8');
  const versionRegex = new RegExp(
    `${pkg.versionPin.exportName}\\s*=\\s*'([^']+)'`
  );
  const pinnedMatch = pinnedContent.match(versionRegex);

  if (!pinnedMatch) {
    throw new Error(
      `Could not parse ${pkg.versionPin.exportName} from ${pkg.versionPin.path}`
    );
  }

  if (pinnedMatch[1] !== currentVersion) {
    throw new Error(
      `Version mismatch for ${pkg.name}: pyproject.toml has ${currentVersion} but ` +
        `${pkg.versionPin.path} pins ${pinnedMatch[1]}`
    );
  }
}

function getPreviousVersion(pyprojectPath) {
  try {
    const previousToml = execFileSync('git', ['show', `HEAD^:${pyprojectPath}`], {
      encoding: 'utf8',
      cwd: root,
    });
    return parseVersion(previousToml);
  } catch {
    // First commit or file did not exist in parent commit.
    return '';
  }
}

function publishPackage(pkg, { force }) {
  const pyprojectFullPath = resolve(root, pkg.pyprojectPath);
  const currentVersion = parseVersion(readFileSync(pyprojectFullPath, 'utf8'));
  const previousVersion = getPreviousVersion(pkg.pyprojectPath);

  if (currentVersion === previousVersion && !force) {
    console.log(
      `Python ${pkg.name} version unchanged (${currentVersion}), skipping PyPI publication.`
    );
    return;
  }

  console.log(
    `Python ${pkg.name} version changed: ${previousVersion || '(none)'} -> ${currentVersion}`
  );

  assertVersionPin(pkg, currentVersion);

  // Clean stale artifacts so globs match exactly one wheel.
  const distDir = resolve(root, pkg.distDir);
  rmSync(distDir, { recursive: true, force: true });

  run('uv', [
    'build',
    '--package',
    pkg.name,
    '--out-dir',
    `${pkg.distDir}/`,
  ]);

  const wheels = readdirSync(distDir).filter(file => file.endsWith('.whl'));
  if (wheels.length !== 1) {
    throw new Error(
      `Expected exactly 1 wheel in ${pkg.projectDir}/dist/, found ${wheels.length}: ${wheels.join(', ')}`
    );
  }
  const wheelPath = join(distDir, wheels[0]);

  run('uv', [
    'run',
    ...pkg.uvRunGroupArgs,
    '--locked',
    '--isolated',
    `--project=${pkg.projectDir}`,
    '--with',
    wheelPath,
    'pytest',
    ...pkg.pytestArgs,
    pkg.testsPath,
  ]);

  // Relies on OIDC trusted publishing env set by release workflows.
  run('uv', ['publish', '--directory', `${pkg.projectDir}/`]);

  console.log(`Successfully published ${pkg.name} ${currentVersion} on PyPI.`);
}

function main() {
  const { force, packageNames } = parseArgs(process.argv.slice(2));
  const selectedPackages = packageNames.map(name => pythonPackageMap.get(name));

  for (const pkg of selectedPackages) {
    publishPackage(pkg, { force });
  }
}

try {
  main();
} catch (error) {
  if (error instanceof UsageError) {
    console.error(error.message);
    console.error('');
    printUsage();
    process.exit(1);
  }
  throw error;
}
