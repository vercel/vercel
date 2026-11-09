const { appendFileSync } = require('node:fs');
const path = require('node:path');
const { getPythonPackages } = require('./get-python-packages');

// Compare the entire match: JavaScript's `$` also matches before a final newline.
function matchesEntireString(value, pattern) {
  return typeof value === 'string' && value.match(pattern)?.[0] === value;
}

function validateDeploymentUrl(value) {
  // Accept HTTPS deployment origins, not credentials, paths, queries, fragments,
  // escapes or shell syntax. This validates syntax, NOT deployment provenance.
  if (
    !matchesEntireString(value, /^https:\/\/[a-zA-Z0-9.-]+(?::[0-9]+)?\/?$/)
  ) {
    throw new Error('Invalid deployment URL');
  }
  const url = new URL(value);
  if (
    url.hostname
      .split('.')
      .some(
        label =>
          !matchesEntireString(
            label,
            /^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/
          )
      )
  ) {
    throw new Error('Invalid deployment hostname');
  }
  return url.origin;
}

function validatePackage(pkg) {
  for (const key of ['packageDir', 'packageName']) {
    if (
      !matchesEntireString(
        pkg?.[key],
        /^[a-zA-Z0-9](?:[a-zA-Z0-9._-]*[a-zA-Z0-9])?$/
      ) ||
      pkg[key].includes('..')
    ) {
      throw new Error(`Invalid Python package ${key}`);
    }
  }
  const envName = `${pkg.packageName.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase()}_PYTHON`;
  if (!matchesEntireString(envName, /^[A-Z_][A-Z0-9_]*$/)) {
    throw new Error('Invalid Python package environment name');
  }
  return { ...pkg, envName };
}

function validateWheelMetadata(metadata) {
  if (
    !metadata ||
    Array.isArray(metadata) ||
    typeof metadata !== 'object' ||
    !Object.hasOwn(metadata, 'filename') ||
    !matchesEntireString(
      metadata.filename,
      /^[a-zA-Z0-9][a-zA-Z0-9._+-]*\.whl$/
    ) ||
    metadata.filename.includes('..')
  ) {
    throw new Error('Invalid Python wheel metadata filename');
  }
  return metadata.filename;
}

async function resolvePythonWheelEnv({
  packages,
  deploymentUrl,
  envFile,
  fetchImpl = fetch,
}) {
  const origin = validateDeploymentUrl(deploymentUrl);
  if (!Array.isArray(packages)) {
    throw new Error('Python packages must be an array');
  }
  if (typeof envFile !== 'string' || !envFile) {
    throw new Error('GITHUB_ENV is required');
  }
  const validatedPackages = packages.map(validatePackage);
  const envNames = new Set(validatedPackages.map(pkg => pkg.envName));
  if (envNames.size !== validatedPackages.length) {
    throw new Error('Duplicate Python package environment name');
  }

  const lines = [];
  for (const { packageDir, packageName, envName } of validatedPackages) {
    const response = await fetchImpl(
      `${origin}/tarballs/${packageDir}-wheel.json`,
      { redirect: 'error', signal: AbortSignal.timeout(15000) }
    );
    // Packages without a built wheel have no sidecar. Do not confuse malformed
    // successful responses, auth/server failures or network errors with absence.
    if (response.status === 404) continue;
    if (!response.ok) {
      throw new Error(`Wheel metadata request failed: HTTP ${response.status}`);
    }
    const filename = validateWheelMetadata(await response.json());
    lines.push(`${envName}=${packageName} @ ${origin}/tarballs/${filename}\n`);
  }

  // Validate ALL responses before touching the environment file. A later bad
  // package must not leave earlier entries installed for subsequent steps.
  if (lines.length > 0) {
    appendFileSync(envFile, lines.join(''), 'utf8');
  }
}

module.exports = {
  resolvePythonWheelEnv,
  validateDeploymentUrl,
  validatePackage,
  validateWheelMetadata,
};

if (require.main === module) {
  resolvePythonWheelEnv({
    packages: getPythonPackages(path.resolve(__dirname, '..')),
    deploymentUrl: process.env.DPL_URL,
    envFile: process.env.GITHUB_ENV,
  }).catch(() => {
    // Do not echo untrusted response bodies or values as workflow commands.
    process.stderr.write(
      'Python wheel URL resolution failed validation or fetch.\n'
    );
    process.exitCode = 1;
  });
}
