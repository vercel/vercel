import { describe, beforeEach, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import domains from '../../../../src/commands/domains';
import { useUser } from '../../../mocks/user';
import { defaultProject } from '../../../mocks/project';
import type { Request } from 'express';

const DOMAIN = 'www.example.com';

function useDomainConfig(
  overrides: Record<string, unknown> = {},
  onRequest?: (req: Request) => void
) {
  client.scenario.get(`/v6/domains/${DOMAIN}/config`, (req, res) => {
    onRequest?.(req);
    res.json({
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
    });
  });
}

function useOwnedDomainNotFound() {
  client.scenario.get(`/v4/domains/${DOMAIN}`, (_req, res) => {
    res.status(404).json({
      error: { code: 'not_found', message: 'Domain not found' },
    });
  });
}

function useNoProjectDomain() {
  client.scenario.get(`/project-domains/${DOMAIN}`, (_req, res) => {
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
    const exitCodePromise = domains(client);
    await expect(client.stderr).toOutput('Misconfigured');
    // The pointing options (A + CNAME) are printed as a single step
    await expect(client.stderr).toOutput('cname.vercel-dns.com');
    await expect(client.stderr).toOutput('Remove the conflicting CAA record');
    await expect(client.stderr).toOutput('Currently resolves to');
    await expect(client.stderr).toOutput('1.2.3.4');
    await expect(client.stderr).toOutput('Nameservers');
    await expect(client.stderr).toOutput('ns1.provider.com');
    expect(await exitCodePromise).toBe(1);
  });

  it('shows the TXT challenge when the project domain is unverified', async () => {
    useDomainConfig();
    useOwnedDomainNotFound();
    let verifyPosted = false;
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
        verifyPosted = true;
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
    await expect(client.stderr).toOutput('Not verified');
    // The TXT challenge and the last-attempt error render as a single step
    await expect(client.stderr).toOutput('missing required TXT Record');
    expect(await exitCodePromise).toBe(1);
    expect(verifyPosted).toBe(true);
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

  it('finds the project with a single by-name lookup when no project is given', async () => {
    useDomainConfig();
    useOwnedDomainNotFound();
    let byNameRequested = false;
    client.scenario.get(`/project-domains/${DOMAIN}`, (_req, res) => {
      byNameRequested = true;
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
    expect(byNameRequested).toBe(true);
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

  describe('--format json', () => {
    it('outputs machine-readable JSON when healthy', async () => {
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

      client.setArgv(
        'domains',
        'verify',
        DOMAIN,
        '--project',
        'my-site',
        '--format',
        'json'
      );
      expect(await domains(client)).toBe(0);

      const payload = JSON.parse(client.stdout.getFullOutput());
      expect(payload.ok).toBe(true);
      expect(payload.domain).toBe(DOMAIN);
      expect(payload.misconfigured).toBe(false);
      expect(payload.project).toMatchObject({
        idOrName: 'my-site',
        attached: true,
        verified: true,
      });
    });

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
