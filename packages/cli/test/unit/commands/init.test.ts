import init from '../../../src/commands/init';
import { client } from '../../mocks/client';
import { setupTmpDir } from '../../helpers/setup-unit-fixture';

let mock;
beforeEach(() => {
  // The examples list endpoint comes from an API that we don't typically mock
  mock = jest.spyOn(client, 'fetch').mockImplementationOnce(url => {
    const url2 = new URL(url);
    if (url2.pathname === '/v2/list.json') {
      return Promise.resolve([
        { name: 'angular', visible: true, suggestions: [] },
        { name: 'astro', visible: true, suggestions: [] },
      ]);
    }
    throw new Error(`Unexpected fetch request for url ${url}`);
  });
});

describe('init', () => {
  describe('triggering the guess prompt', () => {
    it('accepting the guessed example downloads the example', async () => {
      const cwd = setupTmpDir();
      client.cwd = cwd;

      // The without setting this, it's initially undefined, then on the next test retry it's `true`
      process.stdout.isTTY = true;

      client.setArgv('init', 'astroz');
      const exitCodePromise = init(client);

      await expect(client.stdout).toOutput('> Did you mean astro? [y|N]');
      client.stdin.write('y');

      await expect(client.stderr).toOutput(`Fetching astro`);
      expect(mock).toHaveBeenCalled();

      await expect(exitCodePromise).resolves.toEqual(0);
    }, 20000);
    it('rejecting the example exits the process', async () => {
      const cwd = setupTmpDir();
      client.cwd = cwd;

      // The without setting this, it's initially undefined, then on the next test retry it's `true`
      process.stdout.isTTY = true;

      client.setArgv('init', 'astroz');
      const exitCodePromise = init(client);

      await expect(client.stdout).toOutput('> Did you mean astro? [y|N]');

      client.stdin.write('\r'); // Return key
      await expect(client.stderr).toOutput(`> No changes made`);
      expect(mock).toHaveBeenCalled();

      await expect(exitCodePromise).resolves.toEqual(0);
    });
  });
});
