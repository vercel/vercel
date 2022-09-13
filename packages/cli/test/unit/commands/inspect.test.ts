import { client } from '../../mocks/client';
import { useUser } from '../../mocks/user';
import { useDeployment } from '../../mocks/deployment';
import inspect from '../../../src/commands/inspect';

describe('inspect', () => {
  it('should print out deployment information', async () => {
    const user = useUser();
    const deployment = useDeployment({ creator: user });
    client.setArgv('inspect', deployment.url);
    const exitCode = await inspect(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput(
      `> Fetched deployment ${deployment.url} in ${user.username}`
    );
  });

  it('should strip the scheme of a url', async () => {
    const user = useUser();
    const deployment = useDeployment({ creator: user });
    client.setArgv('inspect', `http://${deployment.url}`);
    const exitCode = await inspect(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput(
      `> Fetched deployment ${deployment.url} in ${user.username}`
    );
  });

  it('should print error when deployment not found', async () => {
    const user = useUser();
    useDeployment({ creator: user });
    client.setArgv('inspect', 'bad.com');
    const exitCode = await inspect(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(
      `Error: Failed to find deployment "bad.com" in ${user.username}\n`
    );
  });
});
