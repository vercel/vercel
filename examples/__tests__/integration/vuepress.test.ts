import { deployExample } from '../test-utils';
// https://linear.app/vercel/issue/ZERO-3238/unskip-tests-failing-due-to-node-16-removal
// eslint-disable-next-line jest/no-disabled-tests  
it.skip('[examples] should deploy vuepress', async () => {
  await deployExample('vuepress');
});
