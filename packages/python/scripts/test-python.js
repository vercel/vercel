/* eslint-disable no-console */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const packageRoot = path.resolve(__dirname, '..');

function isListTestsMode(argv) {
  return argv.includes('--listTests') || argv.includes('--list-tests');
}

function resolveTestFile(relOrAbsPath) {
  return path.isAbsolute(relOrAbsPath)
    ? relOrAbsPath
    : path.resolve(packageRoot, relOrAbsPath);
}

function listTestFiles() {
  const candidates = [
    path.resolve(packageRoot, 'test/tests.py'),
    path.resolve(packageRoot, 'test_entrypoint.py'),
  ];

  for (const file of candidates) {
    if (fs.existsSync(file)) {
      console.log(file);
    }
  }
}

function getPythonCommand() {
  const candidates =
    process.platform === 'win32'
      ? [
          { cmd: 'python', argsPrefix: [] },
          { cmd: 'py', argsPrefix: ['-3'] },
        ]
      : [
          { cmd: 'python', argsPrefix: [] },
          { cmd: 'python3', argsPrefix: [] },
        ];

  for (const candidate of candidates) {
    const probe = spawnSync(
      candidate.cmd,
      [...candidate.argsPrefix, '--version'],
      {
        cwd: packageRoot,
        stdio: 'ignore',
        env: process.env,
      }
    );
    if (probe.status === 0) {
      return candidate;
    }
  }

  // In CI we install Python via actions/setup-python which guarantees one of these is present.
  throw new Error(
    'Python executable not found. Tried: ' +
      candidates
        .map(
          c =>
            `${c.cmd}${c.argsPrefix.length ? ' ' + c.argsPrefix.join(' ') : ''}`
        )
        .join(', ')
  );
}

function runTests(testFiles) {
  const { cmd, argsPrefix } = getPythonCommand();

  // If no files are provided, run our default suite (same files as list mode).
  const files =
    testFiles.length > 0
      ? testFiles.map(resolveTestFile)
      : [
          path.resolve(packageRoot, 'test/tests.py'),
          path.resolve(packageRoot, 'test_entrypoint.py'),
        ].filter(f => fs.existsSync(f));

  if (files.length === 0) {
    console.error('No Python test files found to run.');
    process.exitCode = 1;
    return;
  }

  for (const file of files) {
    const result = spawnSync(cmd, [...argsPrefix, file], {
      cwd: packageRoot,
      stdio: 'inherit',
      env: process.env,
    });
    if (result.status !== 0) {
      process.exitCode = result.status ?? 1;
      return;
    }
  }
}

function main() {
  const argv = process.argv.slice(2);

  if (isListTestsMode(argv)) {
    listTestFiles();
    return;
  }

  // Turbo passes relative paths to this script (relative to the package root).
  // Filter out any flags that might be forwarded.
  const testFiles = argv.filter(a => !a.startsWith('-'));
  runTests(testFiles);
}

main();
