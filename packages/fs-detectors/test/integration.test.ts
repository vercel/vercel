import { join } from 'path';

import {
  testDeployment,
  // @ts-ignore
} from '../../../test/lib/deployment/test-deployment';

jest.setTimeout(4 * 60 * 1000);

it('Test `detectBuilders` and `detectRoutes`', async () => {
  const fixture = join(__dirname, 'fixtures', '01-zero-config-api');
  const deployment = await testDeployment(fixture);
  expect(deployment).toBeDefined();
});

it('Test `detectBuilders` with `index` files', async () => {
  const fixture = join(__dirname, 'fixtures', '02-zero-config-api');
  const deployment = await testDeployment(fixture);
  expect(deployment).toBeDefined();
});
