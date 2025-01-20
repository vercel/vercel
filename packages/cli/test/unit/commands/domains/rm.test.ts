import { describe, it, expect } from 'vitest';
import domains from '../../../../src/commands/domains';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useDomain } from '../../../mocks/domains';
import { defaultProject, useProject } from '../../../mocks/project';

describe('domains rm', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'domains';
      const subcommand = 'rm';

      client.setArgv(command, subcommand, '--help');
      const exitCodePromise = domains(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: `${command}:${subcommand}`,
        },
      ]);
    });
  });

  it('should track subcommand usage', async () => {
    client.setArgv('domains', 'rm');
    const exitCode = await domains(client);
    expect(exitCode, 'exit code for "domains"').toEqual(1);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:remove',
        value: 'rm',
      },
    ]);
  });

  describe('[domain]', () => {
    it('should track the redacted [domain] positional argument', async () => {
      useUser();
      const domain = useDomain('one');
      client.scenario.delete(`/v3/domains/${domain.name}`, (_req, res) => {
        res.json({});
      });
      useProject({
        ...defaultProject,
        id: 'vercel-domains-rm',
        name: 'vercel-domains-rm',
      });
      client.setArgv('domains', 'rm', 'example-one.com');
      const exitCodePromise = domains(client);
      await expect(client.stderr).toOutput(
        'Are you sure you want to remove "example-one.com"?'
      );
      client.stdin.write('y\n');
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:remove',
          value: 'rm',
        },
        {
          key: 'argument:domain',
          value: '[REDACTED]',
        },
      ]);
    });

    describe('--yes', () => {
      it('should track usage of the `--yes` flag', async () => {
        useUser();
        const domain = useDomain('one');
        client.scenario.delete(`/v3/domains/${domain.name}`, (_req, res) => {
          res.json({});
        });
        useProject({
          ...defaultProject,
          id: 'vercel-domains-rm',
          name: 'vercel-domains-rm',
        });
        client.setArgv('domains', 'rm', 'example-one.com', '--yes');
        const exitCode = await domains(client);
        expect(exitCode, 'exit code for "domains"').toEqual(0);

        expect(client.telemetryEventStore).toHaveTelemetryEvents([
          {
            key: 'subcommand:remove',
            value: 'rm',
          },
          {
            key: 'argument:domain',
            value: '[REDACTED]',
          },
          {
            key: 'flag:yes',
            value: 'TRUE',
          },
        ]);
      });
    });
  });
});
