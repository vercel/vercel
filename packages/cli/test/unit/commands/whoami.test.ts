import { client } from '../../mocks/client';
import { useUser } from '../../mocks/user';
import whoami from '../../../src/commands/whoami';

describe('whoami', () => {
  it('should reject invalid arguments', async () => {
    client.setArgv('--invalid');
    await expect(whoami(client)).rejects.toThrow(
      'unknown or unexpected option: --invalid'
    );
  });

  it('should print the Vercel username', async () => {
    const user = useUser();
    const exitCode = await whoami(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput(`> ${user.username}\n`);
  });

  it('should print only the Vercel username when output is not a TTY', async () => {
    const user = useUser();
    client.stdout.isTTY = false;
    const exitCode = await whoami(client);
    expect(exitCode).toEqual(0);
    await expect(client.stdout).toOutput(`${user.username}\n`);
  });
});
