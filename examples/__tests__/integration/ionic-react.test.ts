import { deployExample } from '../test-utils';
// TODO: unskip once example is manually changed to `vite`
it.skip('[examples] should deploy ionic-react', async () => {
  await deployExample('ionic-react');
});
