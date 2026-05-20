import { deployExample } from '../test-utils';

// not supported on AL2023
it.skip('[examples] should deploy zola', async () => {
  await deployExample('zola');
});
