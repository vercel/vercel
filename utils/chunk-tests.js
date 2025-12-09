// @ts-check
const child_process = require('node:child_process');
const path = require('node:path');
const { getAffectedPackages } = require('./get-affected-packages');

const runnersMap = new Map([
  [
    'vitest-unit',
    {
      min: 1,
      max: 1,
      testScript: 'vitest-run',
      runners: ['ubuntu-latest', 'macos-14', 'windows-latest'],
      nodeVersions: ['20', '22'],
    },
  ],
  [
    'vitest-unit-node-24',
    {
      min: 1,
      max: 1,
      testScript: 'vitest-run',
      runners: ['ubuntu-latest', 'macos-14'],
      nodeVersions: ['24'],
    },
  ],
  [
    'vitest-e2e',
    {
      min: 1,
      max: 7,
      testScript: 'vitest-run',
      runners: ['ubuntu-latest'],
    },
  ],
  [
    'vitest-e2e-node-20',
    {
      min: 1,
      max: 7,
      testScript: 'vitest-run',
      runners: ['ubuntu-latest'],
      nodeVersions: ['20'],
    },
  ],
  [
    'test-unit',
    {
      min: 1,
      max: 1,
      testScript: 'test',
      runners: ['ubuntu-latest', 'macos-14', 'windows-latest'],
    },
  ],
  [
    'test-e2e',
    {
      min: 1,
      max: 7,
      testScript: 'test',
      runners: ['ubuntu-latest'],
    },
  ],
  [
    'test-e2e-node-all-versions',
    {
      min: 1,
      max: 7,
      testScript: 'test',
      runners: ['ubuntu-latest'],
      nodeVersions: ['20', '22', '24'],
    },
  ],
  [
    'test-next-local',
    {
      min: 1,
      max: 5,
      runners: ['ubuntu-latest'],
      testScript: 'test',
      nodeVersions: ['22'],
    },
  ],
  [
    'test-dev',
    {
      min: 1,
      max: 7,
      testScript: 'test',
      runners: ['ubuntu-latest', 'macos-14'],
    },
  ],
]);

const packageOptionsOverrides = {
  // 'some-package': { min: 1, max: 1 },
};

function getRunnerOptions(scriptName, packageName) {
  let runnerOptions = runnersMap.get(scriptName);
  if (packageOptionsOverrides[packageName]) {
    runnerOptions = Object.assign(
      {},
      runnerOptions,
      packageOptionsOverrides[packageName]
    );
  }
  if (!runnerOptions) {
    throw new Error(
      `Unable to find runner options for package "${packageName}" and script ${scriptName}`
    );
  }
  return runnerOptions;
}

async function getChunkedTests() {
  const scripts = [...runnersMap.keys()];
  const rootPath = path.resolve(__dirname, '..');

  // Get affected packages based on git changes
  const baseSha = process.env.TURBO_BASE_SHA || process.env.GITHUB_BASE_REF;
  const result = baseSha
    ? await getAffectedPackages(baseSha)
    : { result: 'test-all' };

  let affectedPackages = [];
  if (result.result === 'test-affected') {
    affectedPackages = result.packages;
  } else if (result.result === 'test-none') {
    console.error('Testing strategy: no tests (no packages affected)');
    console.log('[]');
    return [];
  }

  console.error(
    `Testing strategy: ${affectedPackages.length > 0 ? 'affected packages only' : 'all packages'}`
  );

  const turboArgs = [
    `run`,
    ...scripts,
    `--cache-dir=.turbo`,
    '--output-logs=full',
    '--log-order=stream',
  ];

  // Add filter for affected packages if we have them
  if (affectedPackages.length > 0) {
    // Create a filter that includes affected packages and their dependents
    const filters = affectedPackages.map(pkg => `--filter=${pkg}...`);
    turboArgs.push(...filters);
  }

  turboArgs.push('--', '--', '--listTests'); // need two of these due to pnpm arg parsing

  const dryRunText = (await turbo(turboArgs)).toString('utf8');

  /**
   * @typedef {string} TestPath
   * @type {{ [package: string]: { [script: string]: TestPath[] } }}
   */
  const testsToRun = {};

  dryRunText
    .split('\n')
    .flatMap(line => {
      const [packageAndScriptName, possiblyPath] = line.split(' ');
      const [packageName, scriptName] = packageAndScriptName.split(':');

      if (!packageName || !scriptName || !possiblyPath?.includes(rootPath)) {
        return [];
      }

      return { testPath: possiblyPath, scriptName, packageName };
    })
    .forEach(({ testPath, scriptName, packageName }) => {
      const [, packageDir, shortPackageName] = testPath
        .replace(rootPath, '')
        .split(path.sep);

      const packagePath =
        path.join(packageDir, shortPackageName) + ',' + packageName;
      testsToRun[packagePath] = testsToRun[packagePath] || {};
      testsToRun[packagePath][scriptName] =
        testsToRun[packagePath][scriptName] || [];
      testsToRun[packagePath][scriptName].push(testPath);
    });

  const chunkedTests = Object.entries(testsToRun).flatMap(
    ([packagePathAndName, scriptNames]) => {
      const [packagePath, packageName] = packagePathAndName.split(',');
      return Object.entries(scriptNames).flatMap(([scriptName, testPaths]) => {
        const runnerOptions = getRunnerOptions(scriptName, packageName);
        const {
          runners,
          min,
          max,
          testScript,
          nodeVersions = ['22'],
        } = runnerOptions;

        const sortedTestPaths = testPaths.sort((a, b) => a.localeCompare(b));
        return intoChunks(min, max, sortedTestPaths).flatMap(
          (chunk, chunkNumber, allChunks) => {
            return nodeVersions.flatMap(nodeVersion => {
              return runners.map(runner => {
                return {
                  runner,
                  packagePath,
                  packageName,
                  scriptName,
                  testScript,
                  nodeVersion,
                  testPaths: chunk.map(testFile =>
                    path.relative(
                      path.join(__dirname, '../', packagePath),
                      testFile
                    )
                  ),
                  chunkNumber: chunkNumber + 1,
                  allChunksLength: allChunks.length,
                };
              });
            });
          }
        );
      });
    }
  );

  return chunkedTests;
}

/**
 * Run turbo cli
 * @param {string[]} args
 */
async function turbo(args) {
  const chunks = [];
  try {
    await new Promise((resolve, reject) => {
      const root = path.resolve(__dirname, '..');
      const turbo = path.join(root, 'node_modules', '.bin', 'turbo');
      const spawned = child_process.spawn(turbo, args, {
        cwd: root,
        env: process.env,
      });
      spawned.stdout.on('data', data => {
        chunks.push(data);
        process.stderr.write(data);
      });
      spawned.stderr.on('data', data => {
        process.stderr.write(data);
      });
      spawned.on('close', code => {
        if (code !== 0) {
          reject(new Error(`Turbo exited with code ${code}`));
        } else {
          resolve(code);
        }
      });
    });
    return Buffer.concat(chunks);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}

/**
 * @template T
 * @param {number} minChunks minimum number of chunks
 * @param {number} maxChunks maximum number of chunks
 * @param {T[]} arr
 * @returns {T[][]}
 */
function intoChunks(minChunks, maxChunks, arr) {
  const chunkSize = Math.max(minChunks, Math.ceil(arr.length / maxChunks));
  const chunks = [];
  for (let i = 0; i < maxChunks; i++) {
    chunks.push(arr.slice(i * chunkSize, (i + 1) * chunkSize));
  }
  return chunks.filter(x => x.length > 0);
}

async function main() {
  try {
    const chunks = await getChunkedTests();
    // TODO: pack and build the runtimes for each package and cache it so we only deploy it once
    console.log(JSON.stringify(chunks));
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  }
}

// @ts-ignore
if (module === require.main || !module.parent) {
  main();
}

module.exports = {
  intoChunks,
};
