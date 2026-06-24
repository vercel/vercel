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
    it('adds a domain to the team without a project', async () => {
      useUser();
      const domain = useDomain();
      client.setArgv('domains', 'add', domain.name);
      client.scenario.post('/v4/domains', (_req, res) => {
        res.json({ domain });
      });
      const exitCode = await domains(client);
      expect(exitCode, 'exit code for "domains"').toEqual(0);

      await expect(client.stderr).toOutput(`Domain ${domain.name} added to`);
      // When no project is provided, we must not print project/deployment
      // oriented configuration guidance.
      const fullOutput = client.stderr.getFullOutput();
      expect(fullOutput).not.toContain(
        'This domain is not configured properly'
      );
      expect(fullOutput).not.toContain(
        'automatically get assigned to your latest production deployment'
      );

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'subcommand:add',
          value: 'add',
        },
        {
          key: 'argument:domain',
          value: '[REDACTED]',
        },
      ]);
    });

    it('errors with a specific message for a subdomain without a project', async () => {
      useUser();
      client.setArgv('domains', 'add', 'sub.example.com');
      const exitCode = await domains(client);
      expect(exitCode, 'exit code for "domains"').toEqual(1);

      await expect(client.stderr).toOutput(
        'Only apex domains can be added without a project. To add the subdomain sub.example.com, pass a project: vercel domains add sub.example.com <project>'
      );
    });

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
