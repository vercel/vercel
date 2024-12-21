import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import domains from '../../../../src/commands/domains';
import { useUser } from '../../../mocks/user';
import { useDomain } from '../../../mocks/domains';
import { useProject } from '../../../mocks/project';

describe('domains inspect', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'domains';
      const subcommand = 'inspect';

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

  describe('[name]', () => {
    it('tracks use of argument', async () => {
      const domain = useDomain('9');
      useUser();
      useProject();

      client.scenario.get(`/v4/domains/${domain.name}/config`, (_req, res) => {
        res.json({});
      });
      client.setArgv('domains', 'inspect', domain.name);
      const exitCodePromise = domains(client);
      await expect(exitCodePromise).resolves.toEqual(null);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:inspect',
          value: 'inspect',
        },
        {
          key: 'argument:domain',
          value: '[REDACTED]',
        },
      ]);
    });
  });
});
