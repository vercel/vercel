import { client } from '../../mocks/client';
import { useUser } from '../../mocks/user';
import bisect from '../../../src/commands/bisect';
import { useDeployment } from '../../mocks/deployment';

describe('bisect', () => {
  it('should find the bad deployment', async () => {
    const user = useUser();

    const now = Date.now();
    const deployment1 = useDeployment({ creator: user, createdAt: now });
    const deployment2 = useDeployment({
      creator: user,
      createdAt: now + 10000,
    });
    const deployment3 = useDeployment({
      creator: user,
      createdAt: now + 20000,
    });

    // also create an extra deployment before the known good deployment
    // to make sure the bisect pool doesn't include it
    useDeployment({
      creator: user,
      createdAt: now - 30000,
    });

    const bisectPromise = bisect(client);

    await expect(client.stderr).toOutput('Specify a URL where the bug occurs:');
    client.stdin.write(`https://${deployment3.url}\n`);

    await expect(client.stderr).toOutput(
      'Specify a URL where the bug does not occur:'
    );
    client.stdin.write(`https://${deployment1.url}\n`);

    await expect(client.stderr).toOutput(
      'Specify the URL subpath where the bug occurs:'
    );
    client.stdin.write('/docs\n');

    await expect(client.stderr).toOutput('Bisecting');
    await expect(client.stderr).toOutput(
      `Deployment URL: https://${deployment2.url}`
    );
    client.stdin.write('b\n');

    await expect(client.stderr).toOutput(
      `The first bad deployment is: https://${deployment2.url}`
    );

    await expect(bisectPromise).resolves.toEqual(0);
  });
});
