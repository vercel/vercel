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
    await expect(client.stderr).toOutput(
      `> Fetched deployment "${deployment.url}" in ${user.username}`
    );
    expect(exitCode).toEqual(0);
  });

  it('should strip the scheme of a url', async () => {
    const user = useUser();
    const deployment = useDeployment({ creator: user });
    client.setArgv('inspect', `http://${deployment.url}`);
    const exitCode = await inspect(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput(
      `> Fetched deployment "${deployment.url}" in ${user.username}`
    );
  });

  it('should print error when deployment not found', async () => {
    const user = useUser();
    useDeployment({ creator: user });
    client.setArgv('inspect', 'bad.com');
    await expect(inspect(client)).rejects.toThrow(
      `Can't find the deployment "bad.com" under the context "${user.username}"`
    );
  });
});
