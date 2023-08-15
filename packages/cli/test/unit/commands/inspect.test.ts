import { client } from '../../mocks/client';
import { useUser } from '../../mocks/user';
import { useDeployment } from '../../mocks/deployment';
import inspect from '../../../src/commands/inspect';
import sleep from '../../../src/util/sleep';

describe('inspect', () => {
  it.skip('should print out deployment information', async () => {
    const user = useUser();
    const deployment = useDeployment({ creator: user });
    client.setArgv('inspect', deployment.url);
    const exitCode = await inspect(client);
    await expect(client.stderr).toOutput(
      `> Fetched deployment "${deployment.url}" in ${user.username}`
    );
    expect(exitCode).toEqual(0);
  });

  it.skip('should print out deployment information for piped URL', async () => {
    const user = useUser();
    const deployment = useDeployment({ creator: user });
    client.stdin.isTTY = false;
    client.stdin.write(deployment.url);
    client.stdin.end();
    const exitCode = await inspect(client);
    await expect(client.stderr).toOutput(
      `> Fetched deployment "${deployment.url}" in ${user.username}`
    );
    expect(exitCode).toEqual(0);
  });

  it.skip('should strip the scheme of a url', async () => {
    const user = useUser();
    const deployment = useDeployment({ creator: user });
    client.setArgv('inspect', `http://${deployment.url}`);
    const exitCode = await inspect(client);
    expect(exitCode).toEqual(0);
    await expect(client.stderr).toOutput(
      `> Fetched deployment "${deployment.url}" in ${user.username}`
    );
  });

  it.skip('should print error when deployment not found', async () => {
    const user = useUser();
    useDeployment({ creator: user });
    client.setArgv('inspect', 'bad.com');
    await expect(inspect(client)).rejects.toThrow(
      `Can't find the deployment "bad.com" under the context "${user.username}"`
    );
  });

  it.skip('should print error if timeout is invalid', async () => {
    const user = useUser();
    useDeployment({ creator: user });
    client.setArgv('inspect', 'foo.com', '--timeout', 'bar');
    const exitCode = await inspect(client);
    expect(exitCode).toEqual(1);
    await expect(client.stderr).toOutput(`Invalid timeout "bar"`);
  });

  it.skip('should wait for a deployment to finish', async () => {
    const user = useUser();
    const deployment = useDeployment({ creator: user, state: 'BUILDING' });
    client.setArgv('inspect', deployment.url, '--wait');

    let exitCode: number | null = null;
    const startTime = Date.now();

    const runInspect = async () => {
      exitCode = await inspect(client);
      await expect(client.stderr).toOutput(
        `> Fetched deployment "${deployment.url}" in ${user.username}`
      );
    };

    const slowlyDeploy = async () => {
      await sleep(1234);
      expect(exitCode).toBeNull();
      deployment.readyState = 'READY';
    };

    await Promise.all<void>([runInspect(), slowlyDeploy()]);

    expect(exitCode).toEqual(0);

    const delta = Date.now() - startTime;
    expect(delta).toBeGreaterThan(1234);
  });
});
