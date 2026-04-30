const path = require('node:path');

const executable = path.basename(process.argv[1] || '');
const command = process.argv.join(' ');
const isTestRunner =
  executable.includes('jest') ||
  executable.includes('vitest') ||
  command.includes('/jest/') ||
  command.includes('/vitest/');

// Prevent the Datadog preload from leaking into child processes spawned by
// tests, such as runtime fixture lambdas and CLI subprocesses.
delete process.env.NODE_OPTIONS;

if (isTestRunner) {
  require('dd-trace/ci/init');
}
