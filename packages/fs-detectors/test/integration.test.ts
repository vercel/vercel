import fs from 'fs';
import { join } from 'path';

import {
  testDeployment,
  // @ts-ignore
} from '../../../test/lib/deployment/test-deployment';

jest.setTimeout(10 * 60 * 1000);

const fixturesPath = join(__dirname, 'fixtures', 'e2e');
const e2eFixtures = fs
  .readdirSync(fixturesPath)
  .filter(name => fs.statSync(join(fixturesPath, name)).isDirectory())
  .sort();
const runFixtureTest = it.concurrent;

// eslint-disable-next-line no-restricted-syntax
for (const fixture of e2eFixtures) {
  // eslint-disable-next-line no-loop-func
  runFixtureTest(`Test e2e fixture "${fixture}"`, async () => {
    const deployment = await testDeployment(join(fixturesPath, fixture));
    expect(deployment).toBeDefined();
  });
}
