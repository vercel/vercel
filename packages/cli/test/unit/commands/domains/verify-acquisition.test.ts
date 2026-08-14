import { beforeEach, describe, expect, it } from 'vitest';
import { acquireVerificationFacts } from '../../../../src/commands/domains/verify-acquisition';
import { client } from '../../../mocks/client';
import { useUser } from '../../../mocks/user';
import { useTeam } from '../../../mocks/team';
import type { Request } from 'express';

const DOMAIN = 'www.example.com';

function useDomainConfig(onRequest?: (req: Request) => void) {
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
    });
  });
}

function useOwnedDomainNotFound(onRequest?: (req: Request) => void) {
  client.scenario.get(`/v4/domains/${DOMAIN}`, (req, res) => {
    onRequest?.(req);
    res.status(404).json({
      error: { code: 'not_found', message: 'Domain not found' },
    });
  });
}

function acquire(project = 'my-site') {
  return acquireVerificationFacts(client, {
    domainName: DOMAIN,
    project,
    strict: false,
  });
}

describe('domains verify acquisition', () => {
  beforeEach(() => {
    useUser();
    useDomainConfig();
    useOwnedDomainNotFound();
  });

  it('keeps permission failures distinct from missing attachments', async () => {
    client.scenario.get(
      `/v9/projects/my-site/domains/${DOMAIN}`,
      (_req, res) => {
        res.status(403).json({
          error: { code: 'forbidden', message: 'Project access denied' },
        });
      }
    );

    const result = await acquire();

    expect(result).toMatchObject({
      ok: false,
      error: {
        kind: 'permission-denied',
        code: 'forbidden',
      },
    });
  });

  it('returns rate limits without retrying or treating them as missing', async () => {
    let requests = 0;
    client.scenario.get(
      `/v9/projects/my-site/domains/${DOMAIN}`,
      (_req, res) => {
        requests++;
        res.status(429).json({
          error: { code: 'rate_limited', message: 'Too many requests' },
        });
      }
    );

    const result = await acquire();

    expect(result).toMatchObject({
      ok: false,
      error: {
        kind: 'api-error',
        code: 'rate_limited',
        message: 'Too many requests',
      },
    });
    expect(requests).toBe(1);
  });

  it('does not retry a rate-limited ownership lookup', async () => {
    client.reset();
    useUser();
    useDomainConfig();
    let ownershipRequests = 0;
    client.scenario.get(`/v4/domains/${DOMAIN}`, (_req, res) => {
      ownershipRequests++;
      res.set('Retry-After', '0');
      res.status(429).json({
        error: { code: 'rate_limited', message: 'Too many requests' },
      });
    });
    client.scenario.get(
      `/v9/projects/my-site/domains/${DOMAIN}`,
      (_req, res) => {
        res.status(404).json({
          error: { code: 'not_found', message: 'Domain not found' },
        });
      }
    );

    const result = await acquire();

    expect(result).toMatchObject({
      ok: true,
      facts: {
        ownership: null,
        project: { kind: 'missing' },
      },
    });
    expect(ownershipRequests).toBe(1);
  });

  it('uses the northstar default team for verification requests', async () => {
    client.reset();
    const team = useTeam('team_default');
    useUser({
      version: 'northstar',
      defaultTeamId: team.id,
    });

    let configTeamId: unknown;
    let ownershipTeamId: unknown;
    let projectTeamId: unknown;
    useDomainConfig(req => {
      configTeamId = req.query.teamId;
    });
    useOwnedDomainNotFound(req => {
      ownershipTeamId = req.query.teamId;
    });
    client.scenario.get(
      `/v9/projects/my-site/domains/${DOMAIN}`,
      (req, res) => {
        projectTeamId = req.query.teamId;
        res.status(404).json({
          error: { code: 'not_found', message: 'Domain not found' },
        });
      }
    );

    const result = await acquire();

    expect(result).toMatchObject({
      ok: true,
      facts: {
        contextName: team.slug,
        teamId: team.id,
      },
    });
    expect(configTeamId).toBe(team.id);
    expect(ownershipTeamId).toBe(team.id);
    expect(projectTeamId).toBe(team.id);
  });
});
