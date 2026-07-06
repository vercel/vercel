import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import domains from '../../../../src/commands/domains';
import { useUser } from '../../../mocks/user';
import { useDomain, useProjectDomains } from '../../../mocks/domains';
import { defaultProject, useProject } from '../../../mocks/project';

function useDomainInspectScenario(domain: { name: string }) {
  client.scenario.get(`/v4/domains/${domain.name}/config`, (_req, res) => {
    res.json({});
  });
  client.scenario.get(
    `/v1/registrar/domains/${encodeURIComponent(domain.name)}/price`,
    (_req, res) => {
      res.json({
        purchasePrice: null,
        renewalPrice: 12,
        transferPrice: null,
        years: 1,
      });
    }
  );
}

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
      useProjectDomains(domain.name, []);
      useDomainInspectScenario(domain);

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

    it('lists projects referenced by the domain project-domains', async () => {
      const domain = useDomain('9');
      useUser();
      useProject();
      useProjectDomains(domain.name, [defaultProject.id]);
      useDomainInspectScenario(domain);

      client.setArgv('domains', 'inspect', domain.name);
      const exitCodePromise = domains(client);
      await expect(client.stderr).toOutput('Projects');
      await expect(client.stderr).toOutput(defaultProject.name);
      await expect(exitCodePromise).resolves.toEqual(null);
    });
  });
});
