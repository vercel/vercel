import open from 'open';
import { join } from 'path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import bisect from '../../../../src/commands/bisect';
import { useDeployment } from '../../../mocks/deployment';
import { isWindows } from '../../../helpers/is-windows';

vi.mock('open', () => {
  return {
    default: vi.fn(),
  };
});

function setupBisectState() {
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

  return { user, deployment1, deployment2, deployment3 };
}

describe('bisect', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'bisect';

      client.setArgv(command, '--help');
      const exitCodePromise = bisect(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: command,
        },
      ]);
    });
  });

  describe('--good', () => {
    it('should not prompt for good deployment when `--good` option is used', async () => {
      const { deployment1, deployment2, deployment3 } = setupBisectState();

      client.setArgv('bisect', '--good', `https://${deployment1.url}`);
      const bisectPromise = bisect(client);

      await expect(client.stderr).toOutput(
        'Specify a URL where the bug occurs:'
      );
      client.stdin.write(`https://${deployment3.url}\n`);

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

    it('should track use of `--good` option', async () => {
      const { deployment1, deployment2, deployment3 } = setupBisectState();

      client.setArgv('bisect', '--good', `https://${deployment1.url}`);
      const bisectPromise = bisect(client);

      await expect(client.stderr).toOutput(
        'Specify a URL where the bug occurs:'
      );
      client.stdin.write(`https://${deployment3.url}\n`);

      await expect(client.stderr).toOutput(
        'Specify the URL subpath where the bug occurs:'
      );
      client.stdin.write('/docs\n');

      await expect(client.stderr).toOutput(
        `Deployment URL: https://${deployment2.url}`
      );
      client.stdin.write('b\n');

      await expect(bisectPromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:good',
          value: '[REDACTED]',
        },
      ]);
    });
  });

  describe('--bad', () => {
    it('should not prompt for bad deployment when `--bad` option is used', async () => {
      const { deployment1, deployment2, deployment3 } = setupBisectState();

      client.setArgv('bisect', '--bad', `https://${deployment3.url}`);
      const bisectPromise = bisect(client);

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

    it('should track use of `--bad` option', async () => {
      const { deployment1, deployment2, deployment3 } = setupBisectState();

      client.setArgv('bisect', '--bad', `https://${deployment3.url}`);
      const bisectPromise = bisect(client);

      await expect(client.stderr).toOutput(
        'Specify a URL where the bug does not occur:'
      );
      client.stdin.write(`https://${deployment1.url}\n`);

      await expect(client.stderr).toOutput(
        'Specify the URL subpath where the bug occurs:'
      );
      client.stdin.write('/docs\n');

      await expect(client.stderr).toOutput(
        `Deployment URL: https://${deployment2.url}`
      );
      client.stdin.write('b\n');

      await expect(bisectPromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:bad',
          value: '[REDACTED]',
        },
      ]);
    });
  });

  describe('--path', () => {
    it('should not prompt for URL subpath when `--path` option is used', async () => {
      const { deployment1, deployment2, deployment3 } = setupBisectState();

      client.setArgv('bisect', '--path', '/docs');
      const bisectPromise = bisect(client);

      await expect(client.stderr).toOutput(
        'Specify a URL where the bug occurs:'
      );
      client.stdin.write(`https://${deployment3.url}\n`);

      await expect(client.stderr).toOutput(
        'Specify a URL where the bug does not occur:'
      );
      client.stdin.write(`https://${deployment1.url}\n`);

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

    it('should track use of `--path` option', async () => {
      const { deployment1, deployment2, deployment3 } = setupBisectState();

      client.setArgv('bisect', '--path', '/docs');
      const bisectPromise = bisect(client);

      await expect(client.stderr).toOutput(
        'Specify a URL where the bug occurs:'
      );
      client.stdin.write(`https://${deployment3.url}\n`);

      await expect(client.stderr).toOutput(
        'Specify a URL where the bug does not occur:'
      );
      client.stdin.write(`https://${deployment1.url}\n`);

      await expect(client.stderr).toOutput(
        `Deployment URL: https://${deployment2.url}`
      );
      client.stdin.write('b\n');

      await expect(bisectPromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:path',
          value: '[REDACTED]',
        },
      ]);
    });
  });

  describe('--open', () => {
    const openMock = vi.mocked(open);

    beforeEach(() => {
      openMock.mockClear();
    });

    it('open the web browser with the "open" npm package', async () => {
      const { deployment1, deployment2, deployment3 } = setupBisectState();

      client.setArgv('bisect', '--open');
      const bisectPromise = bisect(client);

      await expect(client.stderr).toOutput(
        'Specify a URL where the bug occurs:'
      );
      client.stdin.write(`https://${deployment3.url}\n`);

      await expect(client.stderr).toOutput(
        'Specify a URL where the bug does not occur:'
      );
      client.stdin.write(`https://${deployment1.url}\n`);

      await expect(client.stderr).toOutput(
        'Specify the URL subpath where the bug occurs:'
      );
      client.stdin.write('/docs\n');

      await expect(client.stderr).toOutput(
        `Deployment URL: https://${deployment2.url}`
      );

      expect(openMock).toHaveBeenCalledWith(`https://${deployment2.url}/docs`);

      client.stdin.write('b\n');

      await expect(bisectPromise).resolves.toEqual(0);
    });

    it('should track use of `--open` flag', async () => {
      const { deployment1, deployment2, deployment3 } = setupBisectState();

      client.setArgv('bisect', '--open');
      const bisectPromise = bisect(client);

      await expect(client.stderr).toOutput(
        'Specify a URL where the bug occurs:'
      );
      client.stdin.write(`https://${deployment3.url}\n`);

      await expect(client.stderr).toOutput(
        'Specify a URL where the bug does not occur:'
      );
      client.stdin.write(`https://${deployment1.url}\n`);

      await expect(client.stderr).toOutput(
        'Specify the URL subpath where the bug occurs:'
      );
      client.stdin.write('/docs\n');

      await expect(client.stderr).toOutput(
        `Deployment URL: https://${deployment2.url}`
      );
      client.stdin.write('b\n');

      await expect(bisectPromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:open',
          value: 'TRUE',
        },
      ]);
    });
  });

  // Skip this test on Windows because it requires a bash script
  describe.skipIf(isWindows)('--run', () => {
    it('should execute the script when `--run` option is used', async () => {
      const { deployment1, deployment2, deployment3 } = setupBisectState();

      client.setArgv(
        'bisect',
        '--good',
        `https://${deployment1.url}`,
        '--bad',
        `https://${deployment3.url}`,
        '--path',
        '/docs',
        '--run',
        join(__dirname, 'run-bisect.sh')
      );
      const bisectPromise = bisect(client);

      await expect(client.stderr).toOutput('Bisecting');
      await expect(client.stderr).toOutput(
        `Deployment URL: https://${deployment2.url}`
      );
      await expect(client.stderr).toOutput(
        'Run script returned exit code 1: bad'
      );
      await expect(client.stderr).toOutput(
        `The first bad deployment is: https://${deployment2.url}`
      );
      await expect(bisectPromise).resolves.toEqual(0);
    });

    it('should track use of `--run` option', async () => {
      const { deployment1, deployment3 } = setupBisectState();

      client.setArgv(
        'bisect',
        '--good',
        `https://${deployment1.url}`,
        '--bad',
        `https://${deployment3.url}`,
        '--path',
        '/docs',
        '--run',
        join(__dirname, 'run-bisect.sh')
      );
      const bisectPromise = bisect(client);
      await expect(bisectPromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'option:good',
          value: '[REDACTED]',
        },
        {
          key: 'option:bad',
          value: '[REDACTED]',
        },
        {
          key: 'option:path',
          value: '[REDACTED]',
        },
        {
          key: 'option:run',
          value: '[REDACTED]',
        },
      ]);
    });
  });

  it('should prompt the user for feedback to find the bad deployment', async () => {
    const { deployment1, deployment2, deployment3 } = setupBisectState();

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
