const fs = require('fs');
const { join } = require('path');
import { vi, it, expect } from 'vitest';

const {
  testDeployment,
} = require('../../../test/lib/deployment/test-deployment.js');

vi.setConfig({ testTimeout: 12 * 60 * 1000 });

const fixturesPath = join(__dirname, 'fixtures-vite');
const exampleAbsolute = (name: string) =>
  join(__dirname, '..', '..', '..', 'examples', name);

const skipped: string[] = [
  // PLACE TEST FIXTURE NAMES HERE TO SKIP THEM
];

// eslint-disable-next-line no-restricted-syntax
for (const fixture of fs.readdirSync(fixturesPath)) {
  if (skipped.includes(fixture)) {
    // this is currently failing due to the remix artifact being pruned
    continue;
  }
  // eslint-disable-next-line no-loop-func
  it(`should build ${fixture}`, async () => {
    await expect(
      testDeployment(join(fixturesPath, fixture))
    ).resolves.toBeDefined();
  });
}

it(`should build remix example`, async () => {
  const example = exampleAbsolute('remix');
  await expect(testDeployment(example)).resolves.toBeDefined();
});
