import { client } from '../../mocks/client';
import { useUser } from '../../mocks/user';
import bisect from '../../../src/commands/bisect';
import { useDeployments, useDeployment } from '../../mocks/deployment';

describe('bisect', () => {
  it('should ...', async () => {
    const user = useUser();

    const now = Date.now();
    const deployment1 = useDeployment({ creator: user, createdAt: now });
    const deployment2 = useDeployment({ creator: user, createdAt: now + 5000 });
    const deployment3 = useDeployment({
      creator: user,
      createdAt: now + 10000,
    });
    useDeployments();

    // TODO: remove
    console.log({
      deployment1: deployment1.url,
      deployment2: deployment2.url,
      deployment3: deployment3.url,
    });

    const bisectPromise = bisect(client);

    await expect(client.stderr).toOutput('Specify a URL where the bug occurs:');
    client.stdin.write(`${deployment3.url}\n`);

    await expect(client.stderr).toOutput(
      'Specify a URL where the bug does not occur:'
    );
    client.stdin.write(`${deployment1.url}\n`);

    await expect(client.stderr).toOutput(
      'Specify the URL subpath where the bug occurs:'
    );
    client.stdin.write('/docs\n');

    await expect(client.stderr).toOutput(
      `The first bad deployment is: https://${deployment1.url}`
    );

    await expect(bisectPromise).resolves.toEqual(0);
  });
});
