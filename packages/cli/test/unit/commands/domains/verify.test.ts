import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import domains from '../../../../src/commands/domains';
import { useUser } from '../../../mocks/user';
import { defaultProject } from '../../../mocks/project';
import type { Request } from 'express';

const DOMAIN = 'www.example.com';

function domainConfig(overrides: Record<string, unknown> = {}) {
  return {
    configuredBy: 'A',
    misconfigured: false,
    serviceType: 'external',
    nameservers: ['ns1.provider.com', 'ns2.provider.com'],
    cnames: [],
    aValues: ['76.76.21.21'],
    conflicts: [],
    acceptedChallenges: ['http-01', 'dns-01'],
    recommendedIPv4: [{ rank: 1, value: ['76.76.21.21'] }],
    recommendedCNAME: [{ rank: 1, value: 'cname.vercel-dns.com' }],
    ipStatus: 'no-change',
    ...overrides,
  };
}

function useDomainConfigFor(
  domain: string,
  overrides: Record<string, unknown> = {},
  onRequest?: (req: Request) => void
) {
  client.scenario.get(`/v6/domains/${domain}/config`, (req, res) => {
    onRequest?.(req);
    res.json(domainConfig(overrides));
  });
}

function useDomainConfig(
  overrides: Record<string, unknown> = {},
  onRequest?: (req: Request) => void
) {
  useDomainConfigFor(DOMAIN, overrides, onRequest);
}

function useOwnedDomainNotFound(domain = DOMAIN) {
  client.scenario.get(`/v4/domains/${domain}`, (_req, res) => {
    res.status(404).json({
      error: { code: 'not_found', message: 'Domain not found' },
    });
  });
}

function useOwnedDomain(domain = DOMAIN) {
  client.scenario.get(`/v4/domains/${domain}`, (_req, res) => {
    res.json({
      domain: {
        name: domain,
        intendedNameservers: ['ns1.vercel-dns.com', 'ns2.vercel-dns.com'],
      },
    });
  });
}

function useNoProjectDomain(domain = DOMAIN) {
  client.scenario.get(`/project-domains/${domain}`, (_req, res) => {
    res.status(404).json({
      error: { code: 'not_found', message: 'Project domain not found' },
    });
  });
}

function useOwnedDomainForbidden() {
  client.scenario.get(`/v4/domains/${DOMAIN}`, (_req, res) => {
    res.status(403).json({
      error: {
        code: 'forbidden',
        message: `You don't have access to "${DOMAIN}"`,
      },
    });
  });
}

describe('domains verify', () => {
  beforeEach(() => {
    useUser();
  });

  describe('--help', () => {
    it('tracks telemetry', async () => {
      client.setArgv('domains', 'verify', '--help');
      const exitCodePromise = domains(client);
      await expect(exitCodePromise).resolves.toEqual(2);

      expect(client.telemetryEventStore).toHaveTelemetryEvents([
        {
          key: 'flag:help',
          value: 'domains:verify',
        },
      ]);
    });
  });

  it('errors when no domain argument is given', async () => {
    client.setArgv('domains', 'verify');
    const exitCodePromise = domains(client);
    await expect(client.stderr).toOutput('expects one argument');
    expect(await exitCodePromise).toBe(1);
  });

  it('succeeds when the domain is configured and verified for a project', async () => {
    useDomainConfig();
    useOwnedDomainNotFound();
    client.scenario.get(
      `/v9/projects/my-site/domains/${DOMAIN}`,
      (_req, res) => {
        res.json({
          name: DOMAIN,
          apexName: 'example.com',
          projectId: 'prj_123',
          verified: true,
        });
      }
    );

    client.setArgv('domains', 'verify', DOMAIN, '--project', 'my-site');
    const exitCodePromise = domains(client);
    await expect(client.stderr).toOutput('is configured');
    expect(await exitCodePromise).toBe(0);

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:verify',
        value: 'verify',
      },
      {
        key: 'argument:domain',
        value: '[REDACTED]',
      },
      {
        key: 'option:project',
        value: '[REDACTED]',
      },
    ]);
  });

  it('passes the project to the config endpoint', async () => {
    let configQuery: Request['query'] | undefined;
    useDomainConfig({}, req => {
      configQuery = req.query;
    });
    useOwnedDomainNotFound();
    client.scenario.get(
      `/v9/projects/my-site/domains/${DOMAIN}`,
      (_req, res) => {
        res.json({
          name: DOMAIN,
          apexName: 'example.com',
          projectId: 'prj_123',
          verified: true,
        });
      }
    );

    client.setArgv('domains', 'verify', DOMAIN, '--project', 'my-site');
    expect(await domains(client)).toBe(0);
    expect(configQuery?.projectIdOrName).toBe('my-site');
  });

  it('reports misconfigured DNS with recommended records and conflicts', async () => {
    useDomainConfig({
      configuredBy: null,
      misconfigured: true,
      aValues: ['1.2.3.4'],
      ipStatus: 'required-change',
      conflicts: [
        { name: 'example.com', type: 'CAA', value: '0 issue "otherca.com"' },
      ],
    });
    useOwnedDomainNotFound();
    useNoProjectDomain();

    client.setArgv('domains', 'verify', DOMAIN);
    expect(await domains(client)).toBe(1);

    const commandOutput = client.stderr.getFullOutput();
    expect(commandOutput).toContain('Invalid Configuration');
    expect(commandOutput).toContain('cname.vercel-dns.com');
    expect(commandOutput).toContain('Remove the conflicting CAA record');
    expect(commandOutput).toContain('Currently resolves to');
    expect(commandOutput).toContain('1.2.3.4');
    expect(commandOutput).toContain('Nameservers');
    expect(commandOutput).toContain('ns1.provider.com');
  });

  it('requires project attachment before DNS changes for a new unattached domain', async () => {
    const domainName = 'example.com';
    useDomainConfigFor(domainName, {
      configuredBy: null,
      misconfigured: true,
      aValues: ['1.2.3.4'],
      ipStatus: 'required-change',
    });
    useOwnedDomainNotFound(domainName);
    useNoProjectDomain(domainName);

    client.setArgv('domains', 'verify', domainName);
    expect(await domains(client)).toBe(1);

    const commandOutput = client.stderr.getFullOutput();
    const attachIndex = commandOutput.indexOf(
      `Attach ${domainName} to the project that should serve it`
    );
    const dnsIndex = commandOutput.indexOf(
      `Then point ${domainName} to Vercel with the following option:`
    );
    expect(attachIndex).toBeGreaterThanOrEqual(0);
    expect(dnsIndex).toBeGreaterThan(attachIndex);
    expect(commandOutput).toContain(
      `vercel domains add ${domainName} <project>`
    );
    expect(commandOutput).toContain('A      @  76.76.21.21');
  });

  it('shows the TXT challenge when the project domain is unverified', async () => {
    useDomainConfig();
    useOwnedDomainNotFound();
    client.scenario.get(
      `/v9/projects/my-site/domains/${DOMAIN}`,
      (_req, res) => {
        res.json({
          name: DOMAIN,
          apexName: 'example.com',
          projectId: 'prj_123',
          verified: false,
          verification: [
            {
              type: 'TXT',
              domain: '_vercel.example.com',
              value: 'vc-domain-verify=www.example.com,abc123',
              reason: 'pending_domain_verification',
            },
          ],
        });
      }
    );
    client.scenario.post(
      `/v9/projects/my-site/domains/${DOMAIN}/verify`,
      (_req, res) => {
        res.status(400).json({
          error: {
            code: 'missing_txt_record',
            message:
              'Domain _vercel.example.com is missing required TXT Record "vc-domain-verify=www.example.com,abc123"',
          },
        });
      }
    );

    client.setArgv('domains', 'verify', DOMAIN, '--project', 'my-site');
    const exitCodePromise = domains(client);
    await expect(client.stderr).toOutput('Verification Needed');
    // The TXT challenge and the last-attempt error render as a single step
    await expect(client.stderr).toOutput('missing required TXT Record');
    expect(await exitCodePromise).toBe(1);
  });

  it('succeeds when triggering verification flips the domain to verified', async () => {
    useDomainConfig();
    useOwnedDomainNotFound();
    client.scenario.get(
      `/v9/projects/my-site/domains/${DOMAIN}`,
      (_req, res) => {
        res.json({
          name: DOMAIN,
          apexName: 'example.com',
          projectId: 'prj_123',
          verified: false,
          verification: [
            {
              type: 'TXT',
              domain: '_vercel.example.com',
              value: 'vc-domain-verify=www.example.com,abc123',
              reason: 'pending_domain_verification',
            },
          ],
        });
      }
    );
    client.scenario.post(
      `/v9/projects/my-site/domains/${DOMAIN}/verify`,
      (_req, res) => {
        res.json({
          name: DOMAIN,
          apexName: 'example.com',
          projectId: 'prj_123',
          verified: true,
        });
      }
    );

    client.setArgv('domains', 'verify', DOMAIN, '--project', 'my-site');
    const exitCodePromise = domains(client);
    await expect(client.stderr).toOutput('verified for project');
    expect(await exitCodePromise).toBe(0);
  });

  it('reports when the domain is not attached to the given project', async () => {
    useDomainConfig();
    useOwnedDomainNotFound();
    client.scenario.get(
      `/v9/projects/other-site/domains/${DOMAIN}`,
      (_req, res) => {
        res.status(404).json({
          error: { code: 'not_found', message: 'Domain not found' },
        });
      }
    );

    client.setArgv('domains', 'verify', DOMAIN, '--project', 'other-site');
    const exitCodePromise = domains(client);
    await expect(client.stderr).toOutput('Not attached to project');
    await expect(client.stderr).toOutput('domains add');
    expect(await exitCodePromise).toBe(1);
  });

  it('finds the attached project when no project is given', async () => {
    useDomainConfig();
    useOwnedDomainNotFound();
    client.scenario.get(`/project-domains/${DOMAIN}`, (_req, res) => {
      res.json({
        name: DOMAIN,
        apexName: 'example.com',
        projectId: 'prj_123',
        verified: true,
      });
    });
    client.scenario.get('/v9/projects/prj_123', (_req, res) => {
      res.json({ ...defaultProject, id: 'prj_123', name: 'my-site' });
    });

    client.setArgv('domains', 'verify', DOMAIN);
    const exitCodePromise = domains(client);
    await expect(client.stderr).toOutput('verified for project my-site');
    expect(await exitCodePromise).toBe(0);
  });

  it('reports a Vercel-managed project domain as configured', async () => {
    const domainName = 'my-site.vercel.app';
    useDomainConfigFor(domainName, {
      configuredBy: 'A',
      serviceType: 'zeit.world',
      nameservers: ['ns1.vercel-dns-3.com', 'ns2.vercel-dns-3.com'],
      aValues: ['64.29.17.1', '216.198.79.1'],
      recommendedIPv4: [{ rank: 1, value: ['216.150.1.1'] }],
      recommendedCNAME: [
        { rank: 1, value: 'project-specific.vercel-dns-017.com.' },
      ],
      ipStatus: 'optional-change',
    });
    client.scenario.get(`/project-domains/${domainName}`, (_req, res) => {
      res.json({
        name: domainName,
        apexName: 'vercel.app',
        projectId: 'prj_123',
        verified: true,
      });
    });
    client.scenario.get('/v9/projects/prj_123', (_req, res) => {
      res.json({ ...defaultProject, id: 'prj_123', name: 'my-site' });
    });

    client.setArgv('domains', 'verify', domainName);
    expect(await domains(client)).toBe(0);

    const commandOutput = client.stderr.getFullOutput();
    expect(commandOutput).toContain('Valid Configuration');
    expect(commandOutput).toContain('verified for project my-site');
    expect(commandOutput).not.toContain('DNS Change Recommended');
    expect(commandOutput).not.toContain('Ownership');
    expect(commandOutput).not.toContain('CNAME');
  });

  it('recommends adding an owned unattached hostname to a project', async () => {
    const domainName = 'unused.example.com';
    useDomainConfigFor(domainName, {
      configuredBy: 'http',
      serviceType: 'zeit.world',
      nameservers: ['ns2.vercel-dns.com', 'ns1.vercel-dns.com'],
      aValues: ['64.29.17.1', '216.198.79.1'],
      ipStatus: 'required-change',
    });
    useOwnedDomain(domainName);
    useNoProjectDomain(domainName);

    client.setArgv('domains', 'verify', domainName);
    expect(await domains(client)).toBe(0);

    const commandOutput = client.stderr.getFullOutput();
    expect(commandOutput).toContain('Not assessed without a project');
    expect(commandOutput).toContain(
      `vercel domains add ${domainName} <project>`
    );
    expect(commandOutput).toContain(
      `To use ${domainName}, attach it to a project`
    );
    expect(commandOutput).not.toContain(
      'No action is needed for an unused hostname'
    );
    expect(commandOutput).not.toContain('DNS Change Recommended');
    expect(commandOutput).not.toContain('Add a CNAME record');
    expect(commandOutput).not.toContain('cname.vercel-dns.com');
  });

  it('passes --strict to the config endpoint', async () => {
    let configQuery: Request['query'] | undefined;
    useDomainConfig({}, req => {
      configQuery = req.query;
    });
    useOwnedDomainNotFound();
    useNoProjectDomain();

    client.setArgv('domains', 'verify', DOMAIN, '--strict');
    expect(await domains(client)).toBe(0);
    expect(configQuery?.strict).toBe('true');

    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      {
        key: 'subcommand:verify',
        value: 'verify',
      },
      {
        key: 'argument:domain',
        value: '[REDACTED]',
      },
      {
        key: 'flag:strict',
        value: 'TRUE',
      },
    ]);
  });

  it('offers Cloudflare Domain Connect with manual DNS as a fallback', async () => {
    useDomainConfig({
      configuredBy: null,
      misconfigured: true,
      ipStatus: 'required-change',
      nameservers: ['alice.ns.cloudflare.com.', 'bob.ns.cloudflare.com.'],
    });
    useOwnedDomainNotFound();
    client.scenario.get(
      `/v9/projects/my-site/domains/${DOMAIN}`,
      (_req, res) => {
        res.json({
          name: DOMAIN,
          apexName: 'example.com',
          projectId: 'prj_123',
          verified: true,
        });
      }
    );

    client.setArgv('domains', 'verify', DOMAIN, '--project', 'my-site');
    expect(await domains(client)).toBe(1);
    const commandOutput = client.stderr.getFullOutput();
    expect(commandOutput).toContain(
      `Point ${DOMAIN} to Vercel with one of the following options:`
    );
    expect(commandOutput).toContain('Auto configure');
    expect(commandOutput).toContain('domain-connect/apply');
    expect(commandOutput).toContain('Proxy: Disabled');
  });

  describe('--non-interactive', () => {
    afterEach(() => {
      client.nonInteractive = false;
      client.isAgent = false;
    });

    it('emits structured output without requiring --format json', async () => {
      useDomainConfig();
      useOwnedDomainNotFound();
      client.scenario.get(
        `/v9/projects/my-site/domains/${DOMAIN}`,
        (_req, res) => {
          res.json({
            name: DOMAIN,
            apexName: 'example.com',
            projectId: 'prj_123',
            verified: true,
          });
        }
      );

      client.nonInteractive = true;
      client.isAgent = true;
      client.stdin.isTTY = false;
      client.stdout.isTTY = false;
      client.setArgv(
        'domains',
        'verify',
        DOMAIN,
        '--project',
        'my-site',
        '--cwd=/tmp/site'
      );

      expect(await domains(client)).toBe(0);

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload).toMatchObject({
        status: 'ok',
        reason: 'configured_correctly',
        domainStatus: 'configured-correctly',
        ok: true,
      });
      expect(payload.recommended.records).toEqual([
        {
          type: 'CNAME',
          name: 'www',
          value: 'cname.vercel-dns.com',
        },
      ]);
      expect(client.stderr.getFullOutput()).toBe('');
    });

    it('emits actionable next commands and preserves global context', async () => {
      useDomainConfig({
        configuredBy: null,
        misconfigured: true,
        aValues: ['1.2.3.4'],
        ipStatus: 'required-change',
      });
      useOwnedDomainNotFound();
      useNoProjectDomain();

      client.nonInteractive = true;
      client.stdin.isTTY = false;
      client.setArgv(
        'domains',
        'verify',
        DOMAIN,
        '--non-interactive',
        '--cwd=/tmp/site'
      );

      expect(await domains(client)).toBe(1);

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload).toMatchObject({
        status: 'action_required',
        reason: 'invalid_configuration',
        domainStatus: 'invalid-configuration',
        ok: false,
        userActionRequired: true,
      });
      expect(payload.next).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            command: expect.stringContaining(`domains verify ${DOMAIN}`),
          }),
        ])
      );
      expect(payload.next[0].command).toContain('--non-interactive');
      expect(payload.next[0].command).toContain('--cwd=/tmp/site');
      expect(payload.recommended.records).toContainEqual({
        type: 'CNAME',
        name: 'www',
        value: 'cname.vercel-dns.com',
      });
    });

    it('returns missing_arguments with a placeholder command', async () => {
      client.nonInteractive = true;
      client.setArgv(
        'domains',
        'verify',
        '--non-interactive',
        '--cwd=/tmp/site'
      );

      expect(await domains(client)).toBe(1);

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload).toMatchObject({
        status: 'error',
        reason: 'missing_arguments',
      });
      expect(payload.next[0].command).toContain('domains verify <domain>');
      expect(payload.next[0].command).toContain('--non-interactive');
      expect(payload.next[0].command).toContain('--cwd=/tmp/site');
    });
  });

  describe('--format json', () => {
    it('outputs the DNS diff and exits non-zero when misconfigured', async () => {
      useDomainConfig({
        configuredBy: null,
        misconfigured: true,
        aValues: ['1.2.3.4'],
        ipStatus: 'required-change',
      });
      useOwnedDomainNotFound();
      useNoProjectDomain();

      client.setArgv('domains', 'verify', DOMAIN, '--format', 'json');
      expect(await domains(client)).toBe(1);

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.ok).toBe(false);
      expect(payload.status).toBe('action_required');
      expect(payload.reason).toBe('invalid_configuration');
      expect(payload.misconfigured).toBe(true);
      expect(payload.current.aValues).toEqual(['1.2.3.4']);
      expect(payload.recommended.ipv4).toEqual([
        { rank: 1, value: ['76.76.21.21'] },
      ]);
      expect(payload.project).toBe(null);
    });

    it('outputs a JSON error for DNS resolution failures', async () => {
      client.scenario.get(`/v6/domains/${DOMAIN}/config`, (_req, res) => {
        res.status(400).json({
          error: {
            code: 'timeout',
            message: `Resolving ${DOMAIN} DNS configuration timed out.`,
          },
        });
      });
      useOwnedDomainNotFound();
      useNoProjectDomain();

      client.setArgv('domains', 'verify', DOMAIN, '--format', 'json');
      expect(await domains(client)).toBe(1);

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.status).toBe('error');
      expect(payload.reason).toBe('timeout');
      expect(payload.error).toBe('timeout');
      expect(payload.message).toContain('timed out');
    });

    it('errors on an unsupported format', async () => {
      client.setArgv('domains', 'verify', DOMAIN, '--format', 'yaml');
      const exitCodePromise = domains(client);
      await expect(client.stderr).toOutput('Invalid output format');
      expect(await exitCodePromise).toBe(1);
    });
  });

  it('suggests --scope when the domain belongs to another account or team', async () => {
    useDomainConfig({
      configuredBy: null,
      misconfigured: true,
      aValues: [],
    });
    useOwnedDomainForbidden();
    useNoProjectDomain();

    client.setArgv('domains', 'verify', DOMAIN);
    const exitCodePromise = domains(client);
    await expect(client.stderr).toOutput('Not accessible under');
    // `--scope <team>` and `teams ls` are part of the same printed step
    await expect(client.stderr).toOutput('--scope <team>');
    expect(await exitCodePromise).toBe(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Not assessed in this scope'
    );
    expect(client.stderr.getFullOutput()).not.toContain(
      'Invalid Configuration'
    );
    expect(client.stderr.getFullOutput()).not.toContain('avoid downtime');
  });

  it('reports domain ownership in JSON output', async () => {
    useDomainConfig({
      configuredBy: null,
      misconfigured: true,
      aValues: [],
    });
    useOwnedDomainForbidden();
    useNoProjectDomain();

    client.setArgv('domains', 'verify', DOMAIN, '--format', 'json');
    expect(await domains(client)).toBe(1);

    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload.domainOwnership).toBe('other-scope');
    expect(payload.reason).toBe('scope_not_accessible');
    expect(payload.configurationStatus).toBe('scope-resolution-required');
    expect(payload.recommended).toEqual({
      ipv4: [],
      cname: [],
      records: [],
      nameservers: [],
    });
  });

  it('prioritizes scope resolution for an explicit project', async () => {
    useDomainConfig();
    useOwnedDomainForbidden();
    client.scenario.get(
      `/v9/projects/my-site/domains/${DOMAIN}`,
      (_req, res) => {
        res.status(404).json({
          error: { code: 'not_found', message: 'Domain not found' },
        });
      }
    );

    client.setArgv(
      'domains',
      'verify',
      DOMAIN,
      '--project',
      'my-site',
      '--format',
      'json'
    );
    expect(await domains(client)).toBe(1);

    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload).toMatchObject({
      reason: 'scope_not_accessible',
      domainStatus: 'scope-resolution-required',
      configurationStatus: 'scope-resolution-required',
      project: {
        idOrName: 'my-site',
        attached: false,
      },
    });
    expect(
      payload.issues.map(
        (issue: { domainStatus: string }) => issue.domainStatus
      )
    ).toEqual(['scope-resolution-required']);
    expect(payload.next).toEqual([
      {
        command: 'vercel teams ls',
        when: 'List teams to find the scope that owns the domain',
      },
      {
        command: `vercel domains verify ${DOMAIN} --project my-site --format=json --scope <team>`,
        when: 'Replace <team> with the owning team and retry',
      },
    ]);
  });

  it('maps invalid_name to a friendly error', async () => {
    client.scenario.get(`/v6/domains/${DOMAIN}/config`, (_req, res) => {
      res.status(400).json({
        error: {
          code: 'invalid_name',
          message: `Domain name ${DOMAIN} is invalid`,
        },
      });
    });
    useOwnedDomainNotFound();
    useNoProjectDomain();

    client.setArgv('domains', 'verify', DOMAIN);
    const exitCodePromise = domains(client);
    await expect(client.stderr).toOutput('is not a valid domain name');
    expect(await exitCodePromise).toBe(1);
  });
});
