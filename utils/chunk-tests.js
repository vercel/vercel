// @ts-check
const fs = require('node:fs');
const path = require('node:path');
const {
  getAffectedPackages,
  getAllPackages,
} = require('./get-affected-packages');

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

// Test type categorization for filtering
const UNIT_TEST_SCRIPTS = ['vitest-unit', 'vitest-unit-node-24', 'test-unit'];
const E2E_TEST_SCRIPTS = [
  'vitest-e2e',
  'vitest-e2e-node-20',
  'test-e2e',
  'test-e2e-node-all-versions',
  'test-next-local',
  'test-dev',
];

const packageOptionsOverrides = {
  // The vercel CLI package has enough test files that passing them all as
  // command-line arguments exceeds the Windows cmd.exe ~8191 character limit.
  vercel: { max: 2 },
};

const DEFAULT_TEST_FILE_EXTENSIONS = ['js', 'ts', 'mjs', 'mts'];
const DEFAULT_TEST_NAME_PATTERNS = ['test', 'spec'];

function readPackageManifest(rootPath, packageJsonPath) {
  const manifest = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  return {
    packagePath: path.relative(rootPath, path.dirname(packageJsonPath)),
    packageJson: manifest,
    packageName: manifest.name,
  };
}

function getScriptTestPatterns(packageJson, scriptName) {
  const configuredPatterns = packageJson.testing?.[scriptName];
  if (configuredPatterns) {
    return Array.isArray(configuredPatterns)
      ? configuredPatterns
      : [configuredPatterns];
  }

  const script = packageJson.scripts?.[scriptName];
  if (!script) {
    return [];
  }

  const globPatterns = getQuotedPatterns(script);
  if (script.startsWith('glob ') && globPatterns.length > 0) {
    return globPatterns;
  }

  const pnpmTestPatterns = getPatternsAfterCommand(script, 'pnpm test');
  if (pnpmTestPatterns.length > 0) {
    return pnpmTestPatterns;
  }

  const jestPatterns = getPatternsAfterCommand(script, 'jest');
  if (jestPatterns.length > 0) {
    return jestPatterns;
  }

  if (script === 'pnpm test') {
    return getDefaultTestPatterns();
  }

  return [];
}

function getQuotedPatterns(script) {
  const patterns = [];
  const quotedPattern = /'([^']+)'|"([^"]+)"/g;
  let match;
  while ((match = quotedPattern.exec(script))) {
    patterns.push(match[1] || match[2]);
  }
  return patterns.filter(pattern => isLikelyTestPattern(pattern));
}

function getPatternsAfterCommand(script, command) {
  const commandIndex = script.lastIndexOf(command);
  if (commandIndex === -1) {
    return [];
  }

  const args = tokenizeShellArgs(script.slice(commandIndex + command.length));
  const patterns = [];

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '&&' || arg === ';') {
      break;
    }

    if (arg === '--config' || arg === '-c') {
      index += 1;
      continue;
    }

    if (arg.startsWith('-')) {
      continue;
    }

    if (isLikelyTestPattern(arg)) {
      patterns.push(arg);
    }
  }

  return patterns.length > 0 ? patterns : getDefaultTestPatterns();
}

function tokenizeShellArgs(input) {
  const tokens = [];
  const tokenPattern = /'([^']*)'|"([^"]*)"|(\S+)/g;
  let match;
  while ((match = tokenPattern.exec(input))) {
    tokens.push(match[1] || match[2] || match[3]);
  }
  return tokens;
}

function isLikelyTestPattern(pattern) {
  return (
    pattern.includes('/') ||
    pattern.includes('*') ||
    DEFAULT_TEST_NAME_PATTERNS.some(name => pattern.includes(`.${name}.`))
  );
}

function getDefaultTestPatterns() {
  return DEFAULT_TEST_NAME_PATTERNS.flatMap(testName =>
    DEFAULT_TEST_FILE_EXTENSIONS.map(
      extension => `test/**/*.${testName}.${extension}`
    )
  );
}

function getTestPathsForPackage(rootPath, packagePath, patterns) {
  const packageRoot = path.join(rootPath, packagePath);
  const testPaths = new Set();

  for (const pattern of patterns) {
    for (const testPath of expandPattern(packageRoot, pattern)) {
      testPaths.add(testPath);
    }
  }

  return [...testPaths].sort((a, b) => a.localeCompare(b));
}

function expandPattern(packageRoot, pattern) {
  const normalizedPattern = pattern.replace(/\\/g, '/').replace(/^\.\//, '');
  const absolutePattern = path.join(packageRoot, normalizedPattern);

  if (fs.existsSync(absolutePattern)) {
    const stat = fs.statSync(absolutePattern);
    if (stat.isDirectory()) {
      return getDefaultTestPatterns().flatMap(defaultPattern =>
        expandPattern(absolutePattern, defaultPattern.replace(/^test\//, ''))
      );
    }
    return [absolutePattern];
  }

  const matcher = globPatternToRegExp(normalizedPattern);
  return walkFiles(packageRoot)
    .filter(filePath =>
      matcher.test(path.relative(packageRoot, filePath).replace(/\\/g, '/'))
    )
    .sort((a, b) => a.localeCompare(b));
}

function globPatternToRegExp(pattern) {
  let source = '^';
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    const nextChar = pattern[index + 1];
    const followingChar = pattern[index + 2];

    if (char === '*' && nextChar === '*' && followingChar === '/') {
      source += '(?:.*/)?';
      index += 2;
    } else if (char === '*' && nextChar === '*') {
      source += '.*';
      index += 1;
    } else if (char === '*') {
      source += '[^/]*';
    } else if (char === '?') {
      source += '[^/]';
    } else {
      source += escapeRegExp(char);
    }
  }
  source += '$';
  return new RegExp(source);
}

function escapeRegExp(char) {
  return /[\\^$.*+?()[\]{}|]/.test(char) ? `\\${char}` : char;
}

function walkFiles(directory) {
  if (!fs.existsSync(directory)) {
    return [];
  }

  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (
      entry.name === 'node_modules' ||
      entry.name === 'dist' ||
      entry.name === '.turbo'
    ) {
      continue;
    }

    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(entryPath));
    } else {
      files.push(entryPath);
    }
  }
  return files;
}

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
  let scripts = [...runnersMap.keys()];
  const rootPath = path.resolve(__dirname, '..');

  // Filter scripts based on TEST_TYPE environment variable
  const testType = process.env.TEST_TYPE;
  if (testType === 'unit') {
    scripts = scripts.filter(s => UNIT_TEST_SCRIPTS.includes(s));
    console.error('Filtering to unit tests only:', scripts.join(', '));
  } else if (testType === 'e2e') {
    scripts = scripts.filter(s => E2E_TEST_SCRIPTS.includes(s));
    console.error('Filtering to e2e tests only:', scripts.join(', '));
  }

  // Get affected packages based on git changes
  const baseSha = process.env.TURBO_BASE_SHA || process.env.GITHUB_BASE_REF;
  const result = baseSha
    ? await getAffectedPackages(baseSha)
    : { result: 'test-all' };

  let affectedPackages = [];
  if (result.result === 'test-affected' && 'packages' in result) {
    affectedPackages = result.packages;
  } else if (result.result === 'test-none') {
    console.error('Testing strategy: no tests (no packages affected)');
    return [];
  }

  console.error(
    `Testing strategy: ${affectedPackages.length > 0 ? 'affected packages only' : 'all packages'}`
  );

  /**
   * @typedef {string} TestPath
   * @type {{ [package: string]: { [script: string]: TestPath[] } }}
   */
  const testsToRun = {};

  const packageManifests = (await getAllPackages())
    .filter(pkg => pkg.name && pkg.name !== '//' && pkg.path)
    .map(pkg =>
      readPackageManifest(
        rootPath,
        path.join(rootPath, pkg.path, 'package.json')
      )
    );
  const affectedPackageSet = new Set(affectedPackages);
  packageManifests
    .filter(({ packageName }) => {
      return (
        affectedPackageSet.size === 0 || affectedPackageSet.has(packageName)
      );
    })
    .forEach(({ packageJson, packageName, packagePath }) => {
      for (const scriptName of scripts) {
        const patterns = getScriptTestPatterns(packageJson, scriptName);
        if (patterns.length === 0) {
          continue;
        }

        const testPaths = getTestPathsForPackage(
          rootPath,
          packagePath,
          patterns
        );
        if (testPaths.length === 0) {
          continue;
        }

        const packagePathAndName = `${packagePath},${packageName}`;
        testsToRun[packagePathAndName] = testsToRun[packagePathAndName] || {};
        testsToRun[packagePathAndName][scriptName] = testPaths;
      }
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
  getScriptTestPatterns,
};
