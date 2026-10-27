import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import domains from '../../../../src/commands/domains';
import { useUser } from '../../../mocks/user';
import { useDomain, useProjectDomains } from '../../../mocks/domains';
import { defaultProject, useProject } from '../../../mocks/project';

function useDomainInspectScenario(
  domain: { name: string },
  config: { misconfigured?: boolean } = {}
) {
  client.scenario.get(`/v6/domains/${domain.name}/config`, (_req, res) => {
    res.json(config);
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
      await expect(exitCodePromise).resolves.toEqual(0);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: `${command}:${subcommand}`,
        },
      ]);
    });
  });

  describe('machine-readable output', () => {
    it.each([
      ['--format', 'json'],
      ['--format=json'],
      ['-F', 'json'],
      ['--json'],
    ])('prints clean JSON for %s %s', async (...formatArgs: string[]) => {
      const domain = useDomain('9');
      useUser();
      useProject();
      useProjectDomains(domain.name, [defaultProject.id]);
      useDomainInspectScenario(domain);

      client.setArgv('domains', 'inspect', domain.name, ...formatArgs);
      await expect(domains(client)).resolves.toEqual(0);

      const stdout = client.stdout.getFullOutput();
      const parsed = JSON.parse(stdout);
      expect(parsed.domain).toMatchObject({
        name: domain.name,
        creator: domain.creator.username,
        edgeNetwork: true,
        renewalPrice: 12,
      });
      expect(parsed.nameservers).toEqual({
        intended: domain.intendedNameservers,
        current: domain.nameservers,
      });
      expect(parsed.projects).toEqual([
        { name: defaultProject.name, domains: [domain.name] },
      ]);
      expect(parsed.configuration).toEqual({ misconfigured: null });
    });

    it.each([
      true,
      false,
    ])('preserves misconfigured=%s', async misconfigured => {
      const domain = useDomain('9');
      useUser();
      useProjectDomains(domain.name, []);
      useDomainInspectScenario(domain, { misconfigured });
      client.setArgv('domains', 'inspect', domain.name, '--format', 'json');
      await expect(domains(client)).resolves.toEqual(0);
      expect(JSON.parse(client.stdout.getFullOutput()).configuration).toEqual({
        misconfigured,
      });
    });

    it('does not emit a success payload when the domain is missing', async () => {
      useUser();
      client.scenario.get('/v5/domains/missing.example.com', (_req, res) => {
        res.status(404).json({
          error: { code: 'not_found', message: 'Domain not found' },
        });
      });
      useDomainInspectScenario({ name: 'missing.example.com' });
      client.setArgv('domains', 'inspect', 'missing.example.com', '--json');

      await expect(domains(client)).resolves.toEqual(1);
      expect(client.stdout.getFullOutput()).toBe('');
    });

    it('rejects an unsupported output format before fetching', async () => {
      client.setArgv('domains', 'inspect', 'example.com', '--format', 'table');
      await expect(domains(client)).resolves.toEqual(2);
      expect(client.stdout.getFullOutput()).toBe('');
      await expect(client.stderr).toOutput('Invalid output format');
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
      expect(client.stderr.getFullOutput()).not.toContain('domains verify');
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

    it('directs a misconfigured domain to project settings or verifier help', async () => {
      const domain = useDomain('9');
      domain.name = `new.staging.${domain.name}`;
      client.scenario.get(
        `/v5/domains/${encodeURIComponent(domain.name)}`,
        (_req, res) => res.json({ domain })
      );
      useUser();
      useProjectDomains(domain.name, []);
      useDomainInspectScenario(domain, { misconfigured: true });

      client.setArgv('domains', 'inspect', domain.name);
      const exitCodePromise = domains(client);
      await expect(exitCodePromise).resolves.toEqual(null);

      const output = client.stderr.getFullOutput();
      expect(output).toContain(
        'Assign it to a project to see the required DNS records'
      );
      expect(output).toContain('https://vercel.link/domain-configuration');
      expect(output).toContain('vercel domains verify --help');
      expect(output).not.toContain(`domains verify ${domain.name}`);
      expect(output).not.toContain('76.76.21.21');
      expect(output).not.toContain('[recommended]');
      expect(output).not.toContain('Change your Domains');
      expect(output).not.toContain('We will run a verification');
    });

    it("directs a misconfigured project domain to the project's settings", async () => {
      const domain = useDomain('9');
      useUser();
      useProject();
      useProjectDomains(domain.name, [defaultProject.id]);
      useDomainInspectScenario(domain, { misconfigured: true });

      client.setArgv('domains', 'inspect', domain.name);
      const exitCodePromise = domains(client);
      await expect(exitCodePromise).resolves.toEqual(null);

      const output = client.stderr.getFullOutput();
      expect(output).toContain(
        "Check the project's Domains settings for the required DNS records"
      );
      expect(output).toContain(`/${defaultProject.name}/settings/domains`);
      expect(output).toContain('vercel domains verify --help');
    });
  });
});
