const fs = require('fs');
const { join } = require('path');
import { vi, it, expect } from 'vitest';

const {
  testDeployment,
} = require('../../../test/lib/deployment/test-deployment.js');

vi.setConfig({ testTimeout: 12 * 60 * 1000 });

const fixturesPath = join(__dirname, 'fixtures-legacy');

const skipped: string[] = [
  // PLACE TEST FIXTURE NAMES HERE TO SKIP THEM
  // '02-remix-basics-mjs',
  // '12-remix-v2',
  // '13-remix-v2-public-path',
];

// eslint-disable-next-line no-restricted-syntax
for (const fixture of fs.readdirSync(fixturesPath)) {
  if (skipped.includes(fixture)) {
    continue;
  }
  // eslint-disable-next-line no-loop-func
  it(`should build ${fixture}`, async () => {
    await expect(
      testDeployment(join(fixturesPath, fixture))
    ).resolves.toBeDefined();
  });
}
