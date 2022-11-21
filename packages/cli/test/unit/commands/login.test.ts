import login from '../../../src/commands/login';
import { client } from '../../mocks/client';
import { useUser } from '../../mocks/user';

describe('login', () => {
  it('should not allow the `--token` flag', async () => {
    client.setArgv('login', '--token', 'foo');
    const exitCodePromise = login(client);
    await expect(client.stderr).toOutput(
      'Error: `--token` may not be used with the "login" command\n'
    );
    await expect(exitCodePromise).resolves.toEqual(2);
  });

  it('should allow login via email as argument', async () => {
    const user = useUser();
    client.setArgv('login', user.email);
    const exitCodePromise = login(client);
    await expect(client.stderr).toOutput(
      `Success! Email authentication complete for ${user.email}`
    );
    await expect(exitCodePromise).resolves.toEqual(0);
  });

  describe('interactive', () => {
    it('should allow login via email', async () => {
      const user = useUser();
      client.setArgv('login');
      const exitCodePromise = login(client);
      await expect(client.stderr).toOutput(`> Log in to Vercel`);

      // Move down to "Email" option
      client.stdin.write('\x1B[B'); // Down arrow
      client.stdin.write('\x1B[B'); // Down arrow
      client.stdin.write('\x1B[B'); // Down arrow
      client.stdin.write('\r'); // Return key

      await expect(client.stderr).toOutput('> Enter your email address:');

      client.stdin.write(`${user.email}\n`);

      await expect(client.stderr).toOutput(
        `Success! Email authentication complete for ${user.email}`
      );

      await expect(exitCodePromise).resolves.toEqual(0);
    });
  });
});
