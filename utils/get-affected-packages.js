// @ts-check
const child_process = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Get affected packages based on git changes since the given commit
 * @param {string} baseSha - The base commit SHA to compare against
 * @returns {Promise<string[]>} Array of affected package names
 */
async function getAffectedPackages(baseSha) {
  if (!baseSha) {
    console.error('No base SHA provided, testing all packages');
    return [];
  }

  try {
    // Create variables file for turbo query
    const variablesPath = path.resolve(__dirname, '../variables.json');
    fs.writeFileSync(variablesPath, JSON.stringify({ sha: baseSha }));

    const queryPath = path.resolve(__dirname, 'affected-query.gql');
    const response = await turboQuery([
      '--variables',
      variablesPath,
      queryPath,
    ]);

    // Clean up variables file
    fs.unlinkSync(variablesPath);

    const data = JSON.parse(response.toString('utf8'));

    if (!data.data || !data.data.affectedPackages) {
      console.error('No affected packages data found, testing all packages');
      return [];
    }

    // Get changed files for additional e2e logic
    const changedFiles = await getChangedFiles(baseSha);
    const shouldRunAllE2E = shouldRunAllE2ETests(changedFiles);

    // Filter packages that have test tasks (similar to API repo logic)
    const affectedPackages = data.data.affectedPackages.items
      .filter(pkg => {
        if (!pkg.name || pkg.name === '//') return false;

        // Check if package has test-related tasks
        const taskNames = pkg.tasks.items.map(task => task.name);
        return taskNames.some(
          name =>
            name.includes('test') ||
            name.includes('vitest') ||
            name === 'type-check'
        );
      })
      .map(pkg => pkg.name);

    // Handle e2e test special cases
    let finalPackages = affectedPackages;

    if (shouldRunAllE2E) {
      console.error(
        'Infrastructure changes detected - including all e2e test packages'
      );
      // Get all packages with e2e tests
      const allPackagesWithE2E = await getAllPackagesWithE2ETests();
      finalPackages = [
        ...new Set([...affectedPackages, ...allPackagesWithE2E]),
      ];
    }

    console.error(
      `Found ${finalPackages.length} affected packages:`,
      finalPackages
    );
    return finalPackages;
  } catch (error) {
    console.warn('Error getting affected packages:', error.message);
    console.error('Falling back to testing all packages');
    return [];
  }
}

/**
 * Run turbo query command
 * @param {string[]} args
 * @returns {Promise<Buffer>}
 */
async function turboQuery(args) {
  const chunks = [];
  return new Promise((resolve, reject) => {
    const root = path.resolve(__dirname, '..');
    const turbo = path.join(root, 'node_modules', '.bin', 'turbo');
    const spawned = child_process.spawn(turbo, ['query', ...args], {
      cwd: root,
      env: process.env,
    });

    spawned.stdout.on('data', data => {
      chunks.push(data);
    });

    spawned.stderr.on('data', data => {
      process.stderr.write(data);
    });

    spawned.on('close', code => {
      if (code !== 0) {
        reject(new Error(`Turbo query exited with code ${code}`));
      } else {
        resolve(Buffer.concat(chunks));
      }
    });
  });
}

/**
 * Get changed files between base and current commit
 * @param {string} baseSha - The base commit SHA
 * @returns {Promise<string[]>} Array of changed file paths
 */
async function getChangedFiles(baseSha) {
  try {
    const output = child_process.execSync(
      `git diff --name-only ${baseSha} HEAD`,
      {
        encoding: 'utf8',
        cwd: path.resolve(__dirname, '..'),
      }
    );
    return output.split('\n').filter(line => line.length > 0);
  } catch (error) {
    console.warn('Error getting changed files:', error.message);
    return [];
  }
}

/**
 * Determine if we should run all e2e tests based on changed files
 * @param {string[]} changedFiles - Array of changed file paths
 * @returns {boolean} Whether to run all e2e tests
 */
function shouldRunAllE2ETests(changedFiles) {
  // Infrastructure files that affect e2e tests across packages
  const infrastructurePatterns = [
    /^\.github\/workflows\//, // CI workflow changes
    /^turbo\.json$/, // Turbo config changes
    /^package\.json$/, // Root package.json changes
    /^pnpm-lock\.yaml$/, // Dependency changes
    /^utils\/.*\.js$/, // Build/test utility changes
    /^test\/lib\//, // Shared test utilities
    /^packages\/cli\/scripts\/start\.js$/, // CLI entry point
    /^packages\/build-utils\/src\//, // Build utilities that affect all builders
  ];

  return changedFiles.some(file =>
    infrastructurePatterns.some(pattern => pattern.test(file))
  );
}

/**
 * Get all packages that have e2e tests
 * @returns {Promise<string[]>} Array of package names with e2e tests
 */
async function getAllPackagesWithE2ETests() {
  try {
    // Use GraphQL query to find all packages with e2e test tasks
    const variablesPath = path.resolve(
      __dirname,
      'all-packages-variables.json'
    );
    const queryPath = path.resolve(__dirname, 'all-packages-query.gql');

    const response = await turboQuery([
      '--variables',
      variablesPath,
      queryPath,
    ]);

    const data = JSON.parse(response.toString('utf8'));

    if (!data.data || !data.data.packages) {
      console.warn('No packages data found in GraphQL response');
      return [];
    }

    const packagesWithE2E = data.data.packages.items
      .filter(pkg => {
        // Skip root package
        if (!pkg.name || pkg.name === '//') return false;
        // Check if package has e2e test tasks
        if (!pkg.tasks || !pkg.tasks.items) return false;
        const taskNames = pkg.tasks.items.map(task => task.name);
        return taskNames.some(
          taskName =>
            taskName.includes('test-e2e') || taskName.includes('vitest-e2e')
        );
      })
      .map(pkg => pkg.name);

    console.error(
      `Found ${packagesWithE2E.length} packages with e2e tests:`,
      packagesWithE2E
    );
    return packagesWithE2E;
  } catch (error) {
    console.warn('Error getting packages with e2e tests:', error.message);
    return [];
  }
}

module.exports = {
  getAffectedPackages,
  getChangedFiles,
  shouldRunAllE2ETests,
  getAllPackagesWithE2ETests,
};
