import { beforeEach, afterEach, expect } from 'vitest';

// In CI, wrap each test's console output in a GHA log group so it's
// collapsed by default and expandable on click.
// Note: this only works correctly when test files run serially (one per
// chunk). For parallel tests (e.g. examples) the markers interleave and
// GHA can't fold them — but those tests already have the `stdout |` prefix
// from vitest showing which test each line belongs to.
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
