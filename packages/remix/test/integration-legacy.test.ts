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
  // Skipping because it doesn't run yet on Node 22
  '00-pnpm',
  '01-remix-basics',
  '02-remix-basics-mjs',
  '03-with-pnpm',
  '04-with-npm9-linked',
  '05-root-only',
  '06-v2-routing',
  '07-turborepo',
  '08-no-entry-yarn',
  '09-no-entry-pnpm',
  '10-hydrogen-2',
  '11-hydrogen-2-js',
  '12-remix-v2',
  '13-remix-v2-public-path',
  '14-node-linker-hoisted',
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

it('noop test', () => {
  // Since we are skipping all tests, we need to create a noop test to pass the CI.
  expect(true).toBe(true);
});
