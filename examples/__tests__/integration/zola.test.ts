import { deployExample } from '../test-utils';

// not supported on AL2023
// eslint-disable-next-line jest/no-disabled-tests
it.skip('[examples] should deploy zola', async () => {
  await deployExample('zola');
});
