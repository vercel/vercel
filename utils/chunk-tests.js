const child_process = require('child_process');
const path = require('path');

const NUMBER_OF_CHUNKS = 5;
const MINIMUM_PER_CHUNK = 1;
const runnersMap = new Map([
  ['test-e2e', ['ubuntu-latest']],
  ['test-next-local', ['ubuntu-latest']],
  ['test-dev', ['ubuntu-latest', 'macos-latest']],
]);

async function getChunkedTests() {
  const scripts = [...runnersMap.keys()];
  const rootPath = path.resolve(__dirname, '..');

  const dryRunText = (
    await turbo([
      `run`,
      ...scripts,
      `--cache-dir=.turbo`,
      '--output-logs=full',
      '--',
      '--', // need two of these due to pnpm arg parsing
      '--listTests',
    ])
  ).toString('utf8');

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
        const sortedTestPaths = testPaths.sort((a, b) => a.localeCompare(b));
        return intoChunks(NUMBER_OF_CHUNKS, sortedTestPaths).flatMap(
          (chunk, chunkNumber, allChunks) => {
            const runners = runnersMap.get(scriptName) || ['ubuntu-latest'];

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
          resolve();
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
 * @param {number} totalChunks maximum number of chunks
 * @param {T[]} values
 * @returns {T[][]}
 */
function intoChunks(totalChunks, arr) {
  const chunkSize = Math.max(
    MINIMUM_PER_CHUNK,
    Math.ceil(arr.length / totalChunks)
  );
  const chunks = [];
  for (let i = 0; i < totalChunks; i++) {
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

if (module === require.main || !module.parent) {
  main();
}

module.exports = {
  intoChunks,
  NUMBER_OF_CHUNKS,
};
