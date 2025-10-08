import { deployExample } from '../test-utils';
it('[examples] should deploy sveltekit-1', async () => {
  if (process.version.startsWith('v16.')) return; // SvelteKit 2 does require Node18+

  await deployExample('sveltekit-1');
});
