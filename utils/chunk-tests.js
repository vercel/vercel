// @ts-check
const child_process = require('child_process');
const path = require('path');

const runnersMap = new Map([
  [
    'test-unit',
    {
      min: 1,
      max: 1,
      runners: ['ubuntu-latest', 'macos-latest', 'windows-latest'],
    },
  ],
  ['test-e2e', { min: 1, max: 7, runners: ['ubuntu-latest'] }],
  ['test-next-local', { min: 1, max: 5, runners: ['ubuntu-latest'] }],
  ['test-dev', { min: 1, max: 7, runners: ['ubuntu-latest', 'macos-latest'] }],
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
  return (
    runnerOptions || {
      min: 1,
      max: 1,
      runners: ['ubuntu-latest'],
    }
  );
}

async function getChunkedTests() {
  const scripts = [...runnersMap.keys()];
  const rootPath = path.resolve(__dirname, '..');

  const dryRunJson = await spawn('turbo', [
    `run`,
    ...scripts,
    `--cache-dir=.turbo`,
    '--dry-run=json',
  ]);

  const uniquePackages = new Set(
    JSON.parse(dryRunJson)
      .tasks.filter(t => t.cache.status === 'MISS')
      .map(t => t.package)
  );

  process.stderr.write(
    `\nFound uniquePackages: ${JSON.stringify([...uniquePackages])}\n`
  );

  const listTestsText = await spawn('turbo', [
    `run`,
    ...scripts,
    `--cache-dir=.turbo`,
    '--output-logs=full',
    '--log-order=stream',
    '--',
    '--', // need two of these due to pnpm arg parsing
    '--listTests',
  ]);

  /**
   * @typedef {string} TestPath
   * @type {{ [package: string]: { [script: string]: TestPath[] } }}
   */
  const testsToRun = {};

  listTestsText
    .split('\n')
    .flatMap(line => {
      const [packageAndScriptName, possiblyPath] = line.split(' ');
      const [packageName, scriptName] = packageAndScriptName.split(':');

      if (
        !packageName ||
        !scriptName ||
        !possiblyPath?.includes(rootPath) ||
        !uniquePackages.has(packageName)
      ) {
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
        const { runners, min, max } = runnerOptions;

        const sortedTestPaths = testPaths.sort((a, b) => a.localeCompare(b));
        return intoChunks(min, max, sortedTestPaths).flatMap(
          (chunk, chunkNumber, allChunks) => {
            return runners.map(runner => {
              return {
                runner,
                packagePath,
                packageName,
                scriptName,
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
          }
        );
      });
    }
  );

  return chunkedTests;
}

/**
 * Run a binary by spawning a child process.
 * @param {string} command
 * @param {string[]} args
 */
async function spawn(command, args) {
  const chunks = [];
  try {
    await new Promise((resolve, reject) => {
      const root = path.resolve(__dirname, '..');
      const bin = path.join(root, 'node_modules', '.bin', command);
      const spawned = child_process.spawn(bin, args, {
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
    return Buffer.concat(chunks).toString('utf8');
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
