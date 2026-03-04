/**
 * Publish Python packages on PyPI.
 *
 * This script is used by:
 *   - `pnpm ci:publish` via `utils/publish-runtimes.mjs`
 *   - `.github/workflows/release-python-package.yml`
 *
 * Package discovery is based on `utils/get-python-packages.js`.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const PYTHON_VERSIONS_PATH = 'packages/python/src/package-versions.ts';
const require = createRequire(import.meta.url);
const { getPythonPackages } = require('../utils/get-python-packages.js');

function toVersionExportName(packageName) {
  const normalized = packageName
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
  return `${normalized}_VERSION`;
}

const PYTHON_PACKAGES = getPythonPackages(root).map(pkg => ({
  name: pkg.packageName,
  projectDir: pkg.projectDir,
  versionPin: {
    path: PYTHON_VERSIONS_PATH,
    exportName: toVersionExportName(pkg.packageName),
  },
  pyprojectPath: `${pkg.projectDir}/pyproject.toml`,
  distDir: `${pkg.projectDir}/dist`,
  testsPath: `${pkg.projectDir}/tests`,
}));

if (PYTHON_PACKAGES.length === 0) {
  throw new Error('No Python packages discovered under python/*/pyproject.toml');
}
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
    throw new Error(`command failed with exit code ${code}: ${cmdline}`);
  }
}

function assertVersionPin(pkg, currentVersion) {
  if (!pkg.versionPin) {
    return;
  }

  const versionPinPath = resolve(root, pkg.versionPin.path);
  const pinnedContent = readFileSync(versionPinPath, 'utf8');
  const versionRegex = new RegExp(
    `${pkg.versionPin.exportName}\\s*=\\s*['"]([^'"]+)['"]`
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
    '--only-group=test',
    '--locked',
    '--isolated',
    `--project=${pkg.projectDir}`,
    '--with',
    wheelPath,
    'pytest',
    '-v',
    '--tb=short',
    '-k',
    'not test_cqa_',
    pkg.testsPath,
  ]);

  // Relies on OIDC trusted publishing env set by release workflows.
  run('uv', ['publish', '--directory', `${pkg.projectDir}/`]);

  console.log(`Successfully published ${pkg.name} ${currentVersion} on PyPI.`);
}

function main() {
  const { force, packageNames } = parseArgs(process.argv.slice(2));
  const selectedPackages = packageNames.map(name => pythonPackageMap.get(name));

  const failures = [];
  for (const pkg of selectedPackages) {
    try {
      publishPackage(pkg, { force });
    } catch (err) {
      console.error(`\nFailed to publish ${pkg.name}: ${err.message}\n`);
      failures.push(pkg.name);
    }
  }

  if (failures.length > 0) {
    console.error(
      `Publication failed for: ${failures.join(', ')} (${failures.length}/${selectedPackages.length} packages)`
    );
    process.exit(1);
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
