import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useBuildLogs, useDeployment } from '../../../mocks/deployment';
import inspect from '../../../../src/commands/inspect';
import sleep from '../../../../src/util/sleep';

describe('inspect', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'inspect';

      client.setArgv(command, '--help');
      const exitCodePromise = inspect(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: command,
        },
      ]);
    });
  });

  describe('[url]', () => {
    describe('--timeout', async () => {
      it('tracks --timeout', async () => {
        const user = useUser();
        const deployment = useDeployment({ creator: user });
        client.setArgv('inspect', deployment.url, '--timeout', '0');
        const exitCode = await inspect(client);
        expect(exitCode).toEqual(0);

        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: 'argument:deploymentIdOrHost',
            value: '[REDACTED]',
          },
          {
            key: 'option:timeout',
            value: '[REDACTED]',
          },
        ]);
      });
    });

    describe('--wait', async () => {
      it('tracks --wait', async () => {
        const user = useUser();
        const deployment = useDeployment({ creator: user });
        client.setArgv('inspect', deployment.url, '--wait');
        const exitCode = await inspect(client);
        expect(exitCode).toEqual(0);

        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: 'argument:deploymentIdOrHost',
            value: '[REDACTED]',
          },
          {
            key: 'flag:wait',
            value: 'TRUE',
          },
        ]);
      });
    });

    describe('--logs', async () => {
      it('tracks logs', async () => {
        const user = useUser();
        const deployment = useDeployment({ creator: user });
        client.scenario.get(
          `/v3/now/deployments/${deployment.id}/events`,
          (req, res) => {
            res.json([]);
          }
        );

        client.setArgv('inspect', deployment.url, '--logs');
        const exitCode = await inspect(client);
        expect(exitCode).toEqual(0);

        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: 'argument:deploymentIdOrHost',
            value: '[REDACTED]',
          },
          {
            key: 'flag:logs',
            value: 'TRUE',
          },
        ]);
      });
    });

    it('tracks deplomymentUrl as telemetry', async () => {
      const user = useUser();
      const deployment = useDeployment({ creator: user });
      client.setArgv('inspect', deployment.url);
      const exitCode = await inspect(client);
      expect(exitCode).toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'argument:deploymentIdOrHost',
          value: '[REDACTED]',
        },
      ]);
    });

    it('prints error when not providing deployement id or url', async () => {
      client.setArgv('inspect');
      const exitCode = await inspect(client);
      const output = client.getFullOutput();
      expect(exitCode).toEqual(1);
      expect(output).toContain(
        '`vercel inspect <url>` expects exactly one argument'
      );
    });

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

    it('should print target information', async () => {
      const user = useUser();
      const deployment = useDeployment({ creator: user });
      client.setArgv('inspect', deployment.url);
      const exitCode = await inspect(client);
      await expect(client.stderr).toOutput(`target\tproduction`);
      expect(exitCode).toEqual(0);
    });

    it('should print out deployment information for piped URL', async () => {
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

    it('should print error if timeout is invalid', async () => {
      const user = useUser();
      useDeployment({ creator: user });
      client.setArgv('inspect', 'foo.com', '--timeout', 'bar');
      const exitCode = await inspect(client);
      expect(exitCode).toEqual(1);
      await expect(client.stderr).toOutput(`Invalid timeout "bar"`);
    });

    it('should wait for a deployment to finish', async () => {
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

    it('should print no build logs for a queued deployment', async () => {
      const user = useUser();
      const deployment = useDeployment({ creator: user, state: 'QUEUED' });
      useBuildLogs({
        deployment,
        logProducer: async function* () {},
      });

      client.setArgv('inspect', deployment.url, '--logs');
      const exitCode = await inspect(client);
      await expect(client.stderr).toOutput(
        `Fetching deployment "${deployment.url}" in ${user.username}`
      );
      expect(client.getFullOutput().split('\n').slice(1).join('\n'))
        .toMatchInlineSnapshot(`
        "status	● Queued
        "
      `);
      expect(exitCode).toEqual(0);
    });

    it('should print build logs of a failed deployment', async () => {
      const user = useUser();
      const deployment = useDeployment({ creator: user, state: 'ERROR' });
      useBuildLogs({
        deployment,
        logProducer: async function* () {
          yield { created: 1717426870339, text: 'Hello, world!' };
          yield { created: 1717426870340, text: 'Bye...' };
        },
      });

      client.setArgv('inspect', deployment.url, '--logs');
      const exitCode = await inspect(client);
      await expect(client.stderr).toOutput(
        `Fetching deployment "${deployment.url}" in ${user.username}`
      );
      expect(client.getFullOutput().split('\n').slice(1).join('\n'))
        .toMatchInlineSnapshot(`
        "2024-06-03T15:01:10.339Z  Hello, world!
        2024-06-03T15:01:10.340Z  Bye...
        status	● Error
        "
      `);
      expect(exitCode).toEqual(1);
    });

    it('should print build logs while waiting for a finished deployment', async () => {
      let exitCode: number | null = null;
      const user = useUser();
      const deployment = useDeployment({ creator: user, state: 'BUILDING' });
      useBuildLogs({
        deployment,
        logProducer: async function* () {
          yield { created: 1717426870339, text: 'Hello, world!' };
          await sleep(100);
          yield { created: 1717426870340, text: 'building...' };
          await sleep(100);
          yield { created: 1717426871000, text: 'build complete' };
          await sleep(100);
          yield { created: 1717426871235, text: 'Bye...' };
        },
      });

      const runInspect = async () => {
        client.setArgv('inspect', deployment.url, '--logs', '--wait');
        exitCode = await inspect(client);
        await expect(client.stderr).toOutput(
          `Fetching deployment "${deployment.url}" in ${user.username}`
        );
      };

      const slowlyDeploy = async () => {
        await sleep(1234);
        expect(exitCode).toBeNull();
        deployment.readyState = 'READY';
      };

      await Promise.all<void>([runInspect(), slowlyDeploy()]);

      expect(exitCode).toEqual(0);
      expect(client.getFullOutput().split('\n').slice(1).join('\n'))
        .toMatchInlineSnapshot(`
        "2024-06-03T15:01:10.339Z  Hello, world!
        2024-06-03T15:01:10.340Z  building...
        2024-06-03T15:01:11.000Z  build complete
        2024-06-03T15:01:11.235Z  Bye...
        status	● Ready
        "
      `);
    });
  });
});
