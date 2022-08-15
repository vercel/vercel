import { client } from '../../mocks/client';
import { useUser } from '../../mocks/user';
import bisect from '../../../src/commands/bisect';
import {
  useDeployment,
  useDeploymentWithSamlError,
} from '../../mocks/deployment';

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
    const deployment4 = useDeployment({
      creator: user,
      createdAt: now + 30000,
    });

    const bisectPromise = bisect(client);

    await expect(client.stderr).toOutput('Specify a URL where the bug occurs:');
    client.stdin.write(`https://${deployment4.url}\n`);

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
    client.stdin.write('g\n');

    await expect(client.stderr).toOutput('Bisecting');
    await expect(client.stderr).toOutput(
      `Deployment URL: https://${deployment3.url}`
    );
    client.stdin.write('b\n');

    await expect(client.stderr).toOutput(
      `The first bad deployment is: https://${deployment3.url}`
    );

    await expect(bisectPromise).resolves.toEqual(0);
  });

  it('should prompt for login', async () => {
    useDeploymentWithSamlError();

    const bisectPromise = bisect(client);

    await expect(client.stderr).toOutput('Specify a URL where the bug occurs:');
    client.stdin.write(`https://some-9s8df0.vercel.sh\n`);

    await expect(client.stderr).toOutput(
      'Specify a URL where the bug does not occur:'
    );
    client.stdin.write(`https://some-vbn9udf.vercel.sh\n`);

    await expect(client.stderr).toOutput(
      'Specify the URL subpath where the bug occurs:'
    );
    client.stdin.write('/docs\n');

    await expect(client.stderr).toOutput(
      'You must re-authenticate with SAML to use vercel scope.'
    );
    await expect(client.stderr).toOutput('Log in with SAML?');
    client.stdin.write('n\n');

    await expect(client.stderr).toOutput(
      'Response Error (403) when requesting "https://some-9s8df0.vercel.sh"'
    );

    expect(bisectPromise).resolves.toBe(1);

    console.log('TEST OVER');
  });
});
