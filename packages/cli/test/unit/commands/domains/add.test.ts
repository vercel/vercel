import { describe, it, expect } from 'vitest';
import domains from '../../../../src/commands/domains';
import { client } from '../../../mocks/client';
import { useDomain } from '../../../mocks/domains';
import { useProject } from '../../../mocks/project';
import { useUser } from '../../../mocks/user';

describe('domains add', () => {
  describe('--help', () => {
    it('tracks telemetry', async () => {
      const command = 'domains';
      const subcommand = 'add';

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
    describe('[project]', () => {
      describe('--force', () => {
        it('tracks telemetry data', async () => {
          useUser();
          const domain = useDomain();
          const { project } = useProject();
          client.setArgv(
            'domains',
            'add',
            '--force',
            domain.name,
            String(project.name)
          );
          client.scenario.post(
            `/projects/${project.name}/alias`,
            (_req, res) => {
              res.json([{ domain: domain.name }]);
            }
          );
          client.scenario.get(
            `/:version/domains/${domain.name}`,
            (_req, res) => {
              res.json({});
            }
          );
          client.scenario.get(
            `/:version/domains/${domain.name}/config`,
            (_req, res) => {
              res.json({});
            }
          );
          const exitCode = await domains(client);
          expect(exitCode, 'exit code for "domains"').toEqual(0);

          expect(client.telemetryEventStore).toHaveTelemetryEvents([
            {
              key: 'subcommand:add',
              value: 'add',
            },
            {
              key: 'flag:force',
              value: 'TRUE',
            },
            {
              key: 'argument:domain',
              value: '[REDACTED]',
            },
            {
              key: 'argument:project',
              value: '[REDACTED]',
            },
          ]);
        });
      });
    });
  });
});
