import { client } from '../mocks/client';
import { useUser } from '../mocks/user';
import { useDeployment } from '../mocks/deployment';
import inspect from '../../src/commands/inspect';

describe('inspect', () => {
  it('should print out deployment information', async () => {
    const user = useUser();
    const deployment = useDeployment({ creator: user });
    client.setArgv('inspect', deployment.url);
    const exitCode = await inspect(client);
    expect(exitCode).toEqual(0);
    expect(
      client.mockOutput.mock.calls[0][0].startsWith(
        `> Fetched deployment "${deployment.url}" in ${user.username}`
      )
    ).toBeTruthy();
  });

  it('should print error when deployment not found', async () => {
    const user = useUser();
    useDeployment({ creator: user });
    client.setArgv('inspect', 'bad.com');
    const exitCode = await inspect(client);
    expect(exitCode).toEqual(1);
    expect(client.outputBuffer).toEqual(
      `Error! Failed to find deployment "bad.com" in ${user.username}\n`
    );
  });
});
