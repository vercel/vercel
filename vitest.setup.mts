import { beforeEach, afterEach, expect } from 'vitest';

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
