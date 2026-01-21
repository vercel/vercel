/**
 * Syncs version from package.json to pyproject.toml for Python packages.
 *
 * This script is used during the changeset version process to ensure
 * Python packages have their pyproject.toml version updated when
 * changesets bumps the version in package.json.
 *
 * Usage: node utils/sync-python-version.js
 */

const fs = require('fs');
const path = require('path');

const PYTHON_PACKAGES = [
  {
    name: 'vercel-runtime',
    packageJsonPath: 'python/vercel-runtime/package.json',
    pyprojectPath: 'python/vercel-runtime/pyproject.toml',
  },
];

function syncVersion(packageConfig) {
  const { name, packageJsonPath, pyprojectPath } = packageConfig;

  const packageJsonFullPath = path.join(__dirname, '..', packageJsonPath);
  const pyprojectFullPath = path.join(__dirname, '..', pyprojectPath);

  // Read package.json
  if (!fs.existsSync(packageJsonFullPath)) {
    console.log(
      `Skipping ${name}: package.json not found at ${packageJsonPath}`
    );
    return false;
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonFullPath, 'utf8'));
  const version = packageJson.version;

  if (!version) {
    console.log(`Skipping ${name}: no version found in package.json`);
    return false;
  }

  // Read pyproject.toml
  if (!fs.existsSync(pyprojectFullPath)) {
    console.log(
      `Skipping ${name}: pyproject.toml not found at ${pyprojectPath}`
    );
    return false;
  }

  let pyprojectContent = fs.readFileSync(pyprojectFullPath, 'utf8');

  // Extract current version from pyproject.toml
  const versionMatch = pyprojectContent.match(/^version\s*=\s*"([^"]+)"/m);
  if (!versionMatch) {
    console.log(`Skipping ${name}: no version field found in pyproject.toml`);
    return false;
  }

  const currentPyVersion = versionMatch[1];

  if (currentPyVersion === version) {
    console.log(`${name}: versions already in sync (${version})`);
    return false;
  }

  // Update version in pyproject.toml
  pyprojectContent = pyprojectContent.replace(
    /^version\s*=\s*"[^"]+"/m,
    `version = "${version}"`
  );

  fs.writeFileSync(pyprojectFullPath, pyprojectContent);
  console.log(`${name}: synced version ${currentPyVersion} -> ${version}`);
  return true;
}

function main() {
  console.log(
    'Syncing Python package versions from package.json to pyproject.toml...\n'
  );

  let anyUpdated = false;

  for (const packageConfig of PYTHON_PACKAGES) {
    try {
      const updated = syncVersion(packageConfig);
      if (updated) {
        anyUpdated = true;
      }
    } catch (error) {
      console.error(`Error syncing ${packageConfig.name}:`, error.message);
    }
  }

  if (anyUpdated) {
    console.log(
      '\nVersion sync complete. Remember to commit the updated pyproject.toml files.'
    );
  } else {
    console.log('\nNo version changes needed.');
  }
}

main();
