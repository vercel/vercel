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

    it('skips project-domain references whose project cannot be fetched', async () => {
      const domain = useDomain('9');
      useUser();
      useProject();
      // Second reference points at a project the token cannot read
      // (stale reference / no read access) — inspect must not fail on it.
      useProjectDomains(domain.name, [
        defaultProject.id,
        'prj_inaccessible404',
      ]);
      client.scenario.get('/v9/projects/prj_inaccessible404', (_req, res) => {
        res.status(404).json({
          error: { code: 'not_found', message: 'Project not found' },
        });
      });
      useDomainInspectScenario(domain);

      client.setArgv('domains', 'inspect', domain.name);
      const exitCodePromise = domains(client);
      await expect(client.stderr).toOutput(defaultProject.name);
      await expect(exitCodePromise).resolves.toEqual(null);
    });

    it('renders the assigned project-domain names, not production aliases', async () => {
      const domain = useDomain('9');
      useUser();
      useProject();
      // A branch-specific assignment: the subdomain appears only in the
      // project-domains listing, never in the project's production aliases.
      useProjectDomains(
        domain.name,
        [defaultProject.id],
        `staging.${domain.name}`
      );
      useDomainInspectScenario(domain);

      client.setArgv('domains', 'inspect', domain.name);
      const exitCodePromise = domains(client);
      await expect(client.stderr).toOutput(`staging.${domain.name}`);
      await expect(exitCodePromise).resolves.toEqual(null);
    });
  });
});
