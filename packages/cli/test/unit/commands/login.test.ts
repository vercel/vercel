import login from '../../../src/commands/login';
import { client } from '../../mocks/client';
import { useUser } from '../../mocks/user';

describe('login', () => {
  it('should not allow the `--token` flag', async () => {
    client.setArgv('login', '--token', 'foo');
    const exitCode = await login(client);
    expect(exitCode).toEqual(2);
    await expect(client.stderr).toOutput(
      'Error! `--token` may not be used with the "login" command\n'
    );
  });

  it('should allow login via email as argument', async () => {
    const user = useUser();
    client.setArgv('login', user.email);
    const exitCode = await login(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput(
      `Success! Email authentication complete for ${user.email}`
    );
  });
});
