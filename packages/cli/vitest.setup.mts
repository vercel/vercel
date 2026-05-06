import { beforeAll, beforeEach, afterEach, vi, expect } from 'vitest';
import output from './src/output-manager';

beforeAll(() => {
  output.initialize({
    supportsHyperlink: false,
    noColor: true,
  });
});

// In CI, wrap each test's console output in a GHA log group so it's
// collapsed by default and expandable on click.
if (process.env.CI) {
  beforeEach(() => {
    const { currentTestName } = expect.getState();
    if (currentTestName) {
      process.stdout.write(`::group::${currentTestName}\n`);
    }
  });

  afterEach(() => {
    process.stdout.write('::endgroup::\n');
  });
}

if (process.debugPort) {
  // when debugging in an IDE, set a high timeout
  vi.setConfig({ testTimeout: 10 * 60 * 1000 });
}
