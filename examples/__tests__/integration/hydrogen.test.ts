import { deployExample } from '../test-utils';

// Skip this test as it uses deprecated @shopify/hydrogen v1 packages that fail npm install
it.skip('[examples] should deploy hydrogen', async () => {
  await deployExample('hydrogen');
});
