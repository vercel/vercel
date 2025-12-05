const fs = require('fs');
const { join } = require('path');
import { vi, it, expect } from 'vitest';

const {
  testDeployment,
} = require('../../../test/lib/deployment/test-deployment.js');

vi.setConfig({ testTimeout: 12 * 60 * 1000 });

const fixturesPath = join(__dirname, 'fixtures-react-router');
const exampleAbsolute = (name: string) =>
  join(__dirname, '..', '..', '..', 'examples', name);

const skipped: string[] = ['05-react-router-custom-server'];

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

it(`should build react-router example`, async () => {
  const example = exampleAbsolute('react-router');
  await expect(testDeployment(example)).resolves.toBeDefined();
});
