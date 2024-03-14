import init from '../../../src/commands/init';
import { client } from '../../mocks/client';
import { setupTmpDir } from '../../helpers/setup-unit-fixture';
import { FetchOptions } from '../../../src/util/client';

// The without setting this, the client.stderr output is undefined
process.stdout.isTTY = true;

let mock: jest.SpyInstance<
  Promise<unknown>,
  [url: string, opts?: FetchOptions | undefined]
>;
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

      client.setArgv('init', 'astroz');
      const exitCodePromise = init(client);

      await expect(client.stderr).toOutput('? Did you mean astro? [y/N] ');
      client.stdin.write('y');
      client.stdin.write('\r'); // Return key

      await expect(client.stderr).toOutput(`Fetching astro`);
      expect(mock).toHaveBeenCalled();

      await expect(exitCodePromise).resolves.toEqual(0);
      // The long timeout is because this test actually downloads the example from its source
    }, 20000);
    it('rejecting the example exits the process', async () => {
      const cwd = setupTmpDir();
      client.cwd = cwd;

      client.setArgv('init', 'astroz');
      const exitCodePromise = init(client);

      await expect(client.stderr).toOutput('? Did you mean astro? [y/N] ');

      client.stdin.write('\r'); // Return key
      await expect(client.stderr).toOutput(`> No changes made`);
      expect(mock).toHaveBeenCalled();

      await expect(exitCodePromise).resolves.toEqual(0);
    });
  });
});
