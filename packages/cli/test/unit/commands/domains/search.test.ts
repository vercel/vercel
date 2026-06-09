import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import domains from '../../../../src/commands/domains';
import { client } from '../../../mocks/client';

let globalConfigDir: string;

beforeEach(async () => {
  globalConfigDir = await mkdtemp(join(tmpdir(), 'domains-search-cache-'));
  vi.spyOn(client, 'getGlobalPathConfig').mockReturnValue(globalConfigDir);
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(globalConfigDir, { recursive: true, force: true });
});

describe('domains search', () => {
  it('prints subcommand help', async () => {
    client.setArgv('domains', 'search', '--help');

    expect(await domains(client)).toEqual(2);
    expect(client.stderr.getFullOutput()).toContain(
      'Discover domain-name candidates from a keyword or fragment'
    );
  });

  it('discovers and quotes domain candidates as JSON', async () => {
    client.scenario.get('/v1/registrar/tlds/supported', (_req, res) => {
      res.json(['com', 'dev']);
    });
    client.scenario.post('/v1/registrar/domains/search', (req, res) => {
      expect(req.body).toEqual({ domains: ['acme.com', 'acme.dev'] });
      res.json({
        results: [
          {
            domain: 'acme.com',
            available: true,
            price: 20,
            renewalPrice: 20,
            years: 1,
            premium: false,
          },
          {
            domain: 'acme.dev',
            available: false,
          },
        ],
      });
    });

    client.setArgv('domains', 'search', 'acme', '--format=json');
    const exitCode = await domains(client);

    expect(exitCode).toEqual(0);
    expect(client.stdout.getFullOutput()).toMatchInlineSnapshot(`
      "{
        "query": "acme",
        "order": "relevance",
        "results": [
          {
            "domain": "acme.com",
            "available": true,
            "purchasePrice": 20,
            "renewalPrice": 20,
            "years": 1
          },
          {
            "domain": "acme.dev",
            "available": false,
            "purchasePrice": null,
            "renewalPrice": null,
            "years": null
          }
        ],
        "pagination": {
          "next": null,
          "limit": 20
        }
      }
      "
    `);
  });

  it('reuses the supported TLD catalog for 30 minutes', async () => {
    let supportedTlds = ['com'];
    client.scenario.get('/v1/registrar/tlds/supported', (_req, res) => {
      res.json(supportedTlds);
    });
    client.scenario.post('/v1/registrar/domains/search', (req, res) => {
      const body = req.body as { domains?: string[] };
      res.json({
        results: body.domains?.map(domain => ({
          domain,
          available: true,
          price: 20,
          renewalPrice: 20,
          years: 1,
          premium: false,
        })),
      });
    });

    client.setArgv('domains', 'search', 'acme', '--format=json');
    expect(await domains(client)).toEqual(0);
    const firstOutput = client.stdout.getFullOutput();

    supportedTlds = ['dev'];
    client.setArgv('domains', 'search', 'acme', '--format=json');
    expect(await domains(client)).toEqual(0);

    expect(
      JSON.parse(client.stdout.getFullOutput().slice(firstOutput.length))
        .results
    ).toMatchObject([{ domain: 'acme.com' }]);
  });

  it('refreshes the supported TLD catalog after 30 minutes', async () => {
    const now = Date.now();
    const dateNow = vi.spyOn(Date, 'now').mockReturnValue(now);
    let supportedTlds = ['com'];
    client.scenario.get('/v1/registrar/tlds/supported', (_req, res) => {
      res.json(supportedTlds);
    });
    client.scenario.post('/v1/registrar/domains/search', (req, res) => {
      const body = req.body as { domains?: string[] };
      res.json({
        results: body.domains?.map(domain => ({
          domain,
          available: true,
          price: 20,
          renewalPrice: 20,
          years: 1,
          premium: false,
        })),
      });
    });

    client.setArgv('domains', 'search', 'acme', '--format=json');
    expect(await domains(client)).toEqual(0);
    const firstOutput = client.stdout.getFullOutput();

    supportedTlds = ['dev'];
    dateNow.mockReturnValue(now + 30 * 60 * 1000 + 1);
    client.setArgv('domains', 'search', 'acme', '--format=json');
    expect(await domains(client)).toEqual(0);

    expect(
      JSON.parse(client.stdout.getFullOutput().slice(firstOutput.length))
        .results
    ).toMatchObject([{ domain: 'acme.dev' }]);
  });

  it('ignores a malformed supported TLD cache', async () => {
    const cachePath = join(
      globalConfigDir,
      'cache',
      'domains-search-supported-tlds.json'
    );
    await mkdir(dirname(cachePath), { recursive: true });
    await writeFile(cachePath, '{', 'utf8');

    client.scenario.get('/v1/registrar/tlds/supported', (_req, res) => {
      res.json(['com']);
    });
    client.scenario.post('/v1/registrar/domains/search', (req, res) => {
      const body = req.body as { domains?: string[] };
      res.json({
        results: body.domains?.map(domain => ({
          domain,
          available: true,
          price: 20,
          renewalPrice: 20,
          years: 1,
          premium: false,
        })),
      });
    });

    client.setArgv('domains', 'search', 'acme', '--format=json');
    expect(await domains(client)).toEqual(0);

    expect(JSON.parse(client.stdout.getFullOutput()).results).toMatchObject([
      { domain: 'acme.com' },
    ]);
  });

  it('isolates cached TLD catalogs by order and active team', async () => {
    client.scenario.get('/v1/registrar/tlds/supported', (req, res) => {
      if (req.query.teamId === 'team_b') {
        res.json(['net']);
      } else if (req.query.order === 'alphabetical') {
        res.json(['dev']);
      } else {
        res.json(['com']);
      }
    });
    client.scenario.post('/v1/registrar/domains/search', (req, res) => {
      const body = req.body as { domains?: string[] };
      res.json({
        results: body.domains?.map(domain => ({
          domain,
          available: true,
          price: 20,
          renewalPrice: 20,
          years: 1,
          premium: false,
        })),
      });
    });

    client.config.currentTeam = 'team_a';
    client.setArgv('domains', 'search', 'acme', '--format=json');
    expect(await domains(client)).toEqual(0);
    const relevanceOutput = client.stdout.getFullOutput();

    client.setArgv(
      'domains',
      'search',
      'acme',
      '--order=alphabetical',
      '--format=json'
    );
    expect(await domains(client)).toEqual(0);
    const alphabeticalOutput = client.stdout
      .getFullOutput()
      .slice(relevanceOutput.length);

    client.config.currentTeam = 'team_b';
    client.setArgv('domains', 'search', 'acme', '--format=json');
    expect(await domains(client)).toEqual(0);
    const teamOutput = client.stdout
      .getFullOutput()
      .slice(relevanceOutput.length + alphabeticalOutput.length);

    expect(JSON.parse(relevanceOutput).results).toMatchObject([
      { domain: 'acme.com' },
    ]);
    expect(JSON.parse(alphabeticalOutput).results).toMatchObject([
      { domain: 'acme.dev' },
    ]);
    expect(JSON.parse(teamOutput).results).toMatchObject([
      { domain: 'acme.net' },
    ]);
  });

  it('narrows TLD fragments and renders action-oriented human output', async () => {
    client.scenario.get('/v1/registrar/tlds/supported', (_req, res) => {
      res.json(['co.uk', 'com', 'co', 'company']);
    });
    client.scenario.post('/v1/registrar/domains/search', (_req, res) => {
      res.json({
        results: [
          {
            domain: 'acme.co',
            available: true,
            price: 25,
            renewalPrice: 40,
            years: 2,
            premium: false,
          },
          {
            domain: 'acme.co.uk',
            available: false,
          },
          {
            domain: 'acme.com',
            available: false,
          },
          {
            domain: 'acme.company',
            available: true,
            price: 18,
            renewalPrice: 24,
            years: 1,
            premium: true,
          },
        ],
      });
    });

    client.setArgv('domains', 'search', ' ACME.co ');
    const exitCode = await domains(client);

    expect(exitCode).toEqual(0);
    expect(
      client.stderr.getFullOutput().replace(/[ \t]+$/gm, '')
    ).toMatchInlineSnapshot(`
      "> Domain        Availability  Purchase       Renewal
      acme.co       Available     $25 / 2 years  $40 / 2 years
      acme.co.uk    Unavailable   -              -
      acme.com      Unavailable   -              -
      acme.company  Available     $18 / 1 year   $24 / 1 year
      "
    `);
  });

  it('handles unsorted relevance responses and prefers an exact TLD fragment', async () => {
    client.scenario.get('/v1/registrar/tlds/supported', (_req, res) => {
      res.json(['company', 'co.uk', 'co', 'com', 'net']);
    });
    client.scenario.post('/v1/registrar/domains/search', (req, res) => {
      const body = req.body as { domains?: string[] };
      res.json({
        results: body.domains?.map(domain => ({
          domain,
          available: true,
          price: 20,
          renewalPrice: 25,
          years: 1,
          premium: false,
        })),
      });
    });

    client.setArgv('domains', 'search', 'acme.co', '--format=json');
    expect(await domains(client)).toEqual(0);

    expect(
      JSON.parse(client.stdout.getFullOutput()).results.map(
        (result: { domain: string }) => result.domain
      )
    ).toEqual(['acme.co', 'acme.company', 'acme.co.uk', 'acme.com']);
  });

  it('filters candidates by repeatable exact TLDs', async () => {
    client.scenario.get('/v1/registrar/tlds/supported', (_req, res) => {
      res.json(['com', 'dev', 'co.uk', 'net']);
    });
    client.scenario.post('/v1/registrar/domains/search', (req, res) => {
      expect(req.body).toEqual({ domains: ['acme.com', 'acme.dev'] });
      const body = req.body as { domains: string[] };
      res.json({
        results: body.domains.map(domain => ({
          domain,
          available: true,
          price: 20,
          renewalPrice: 25,
          years: 1,
          premium: false,
        })),
      });
    });

    client.setArgv(
      'domains',
      'search',
      'acme',
      '--tld',
      '.DEV',
      '--tld=COM',
      '--tld',
      'dev',
      '--format=json'
    );
    expect(await domains(client)).toEqual(0);

    expect(
      JSON.parse(client.stdout.getFullOutput()).results.map(
        (result: { domain: string }) => result.domain
      )
    ).toEqual(['acme.com', 'acme.dev']);
  });

  it('combines a TLD fragment with exact TLD filters', async () => {
    client.scenario.get('/v1/registrar/tlds/supported', (_req, res) => {
      res.json(['co.uk', 'co.ug', 'com']);
    });
    client.scenario.post('/v1/registrar/domains/search', (req, res) => {
      expect(req.body).toEqual({ domains: ['acme.co.uk'] });
      res.json({
        results: [
          {
            domain: 'acme.co.uk',
            available: true,
            price: 20,
            renewalPrice: 25,
            years: 1,
            premium: false,
          },
        ],
      });
    });

    client.setArgv(
      'domains',
      'search',
      'acme.co.u',
      '--tld=co.uk',
      '--tld=com',
      '--format=json'
    );
    expect(await domains(client)).toEqual(0);
    expect(JSON.parse(client.stdout.getFullOutput()).results).toMatchObject([
      { domain: 'acme.co.uk' },
    ]);
  });

  it('returns an empty result when exact TLD filters do not match', async () => {
    client.scenario.get('/v1/registrar/tlds/supported', (_req, res) => {
      res.json(['com', 'dev']);
    });

    client.setArgv('domains', 'search', 'acme', '--tld=net', '--format=json');
    expect(await domains(client)).toEqual(0);
    expect(JSON.parse(client.stdout.getFullOutput()).results).toEqual([]);
  });

  it('rejects malformed search responses returned as an array', async () => {
    client.scenario.get('/v1/registrar/tlds/supported', (_req, res) => {
      res.json(['com', 'dev']);
    });
    client.scenario.post('/v1/registrar/domains/search', (_req, res) => {
      res.json([
        {
          domain: 'acme.com',
          available: true,
          price: 20,
          renewalPrice: 20,
          years: 1,
          premium: false,
        },
        {
          domain: 'acme.dev',
          available: false,
        },
      ]);
    });

    client.setArgv('domains', 'search', 'acme', '--format=json');
    expect(await domains(client)).toEqual(1);
    expect(client.stdout.getFullOutput()).toEqual('');
  });

  it('continues after the last TLD with a different valid limit', async () => {
    client.scenario.get('/v1/registrar/tlds/supported', (_req, res) => {
      res.json(['com', 'dev', 'io', 'net']);
    });
    client.scenario.post('/v1/registrar/domains/search', (req, res) => {
      const body = req.body as { domains?: string[] };
      res.json({
        results: body.domains?.map(domain => ({
          domain,
          available: true,
          price: 20,
          renewalPrice: 20,
          years: 1,
          premium: false,
        })),
      });
    });

    client.setArgv('domains', 'search', 'acme', '--limit=2', '--format=json');
    expect(await domains(client)).toEqual(0);

    const firstOutput = client.stdout.getFullOutput();
    const firstPage = JSON.parse(firstOutput);
    expect(
      firstPage.results.map((result: { domain: string }) => result.domain)
    ).toEqual(['acme.com', 'acme.dev']);
    expect(firstPage.pagination.limit).toEqual(2);
    expect(firstPage.pagination.next).toEqual(expect.any(String));

    client.setArgv(
      'domains',
      'search',
      'acme',
      '--next',
      firstPage.pagination.next,
      '--limit=1',
      '--format=json'
    );
    expect(await domains(client)).toEqual(0);

    const secondPage = JSON.parse(
      client.stdout.getFullOutput().slice(firstOutput.length)
    );
    expect(
      secondPage.results.map((result: { domain: string }) => result.domain)
    ).toEqual(['acme.io']);
    expect(secondPage.pagination.limit).toEqual(1);
    expect(secondPage.pagination.next).toEqual(expect.any(String));
  });

  it('returns an empty result when no TLDs match', async () => {
    client.scenario.get('/v1/registrar/tlds/supported', (_req, res) => {
      res.json(['com', 'dev']);
    });

    client.setArgv('domains', 'search', 'acme.xyz', '--format=json');
    expect(await domains(client)).toEqual(0);

    expect(JSON.parse(client.stdout.getFullOutput())).toMatchObject({
      results: [],
      pagination: {
        next: null,
      },
    });
  });

  it('returns an empty final page', async () => {
    const now = Date.now();
    const dateNow = vi.spyOn(Date, 'now').mockReturnValue(now);
    let catalogRequestCount = 0;
    client.scenario.get('/v1/registrar/tlds/supported', (_req, res) => {
      catalogRequestCount++;
      res.json(
        catalogRequestCount === 1 ? ['com', 'dev', 'io'] : ['com', 'dev']
      );
    });
    client.scenario.post('/v1/registrar/domains/search', (req, res) => {
      const body = req.body as { domains?: string[] };
      res.json({
        results: body.domains?.map(domain => ({
          domain,
          available: true,
          price: 20,
          renewalPrice: 20,
          years: 1,
          premium: false,
        })),
      });
    });

    client.setArgv('domains', 'search', 'acme', '--limit=2', '--format=json');
    expect(await domains(client)).toEqual(0);
    const firstOutput = client.stdout.getFullOutput();
    const cursor = JSON.parse(firstOutput).pagination.next;

    dateNow.mockReturnValue(now + 30 * 60 * 1000 + 1);
    client.setArgv(
      'domains',
      'search',
      'acme',
      '--next',
      cursor,
      '--format=json'
    );
    expect(await domains(client)).toEqual(0);

    expect(
      JSON.parse(client.stdout.getFullOutput().slice(firstOutput.length))
    ).toMatchObject({
      results: [],
      pagination: {
        next: null,
      },
    });
  });

  it('prints a readable continuation command for human output', async () => {
    client.scenario.get('/v1/registrar/tlds/supported', (_req, res) => {
      res.json(['com', 'dev']);
    });
    client.scenario.post('/v1/registrar/domains/search', (req, res) => {
      const body = req.body as { domains?: string[] };
      res.json({
        results: body.domains?.map(domain => ({
          domain,
          available: true,
          price: 20,
          renewalPrice: 20,
          years: 1,
          premium: false,
        })),
      });
    });

    client.setArgv('domains', 'search', 'acme', '--limit=1');
    expect(await domains(client)).toEqual(0);

    expect(client.stderr.getFullOutput()).toContain(
      'To continue, run `vercel domains search acme --next '
    );
    expect(client.stderr.getFullOutput()).not.toContain('--order=');
  });

  it('preserves non-default ordering in the human continuation command', async () => {
    client.scenario.get('/v1/registrar/tlds/supported', (_req, res) => {
      res.json(['com', 'dev']);
    });
    client.scenario.post('/v1/registrar/domains/search', (req, res) => {
      const body = req.body as { domains?: string[] };
      res.json({
        results: body.domains?.map(domain => ({
          domain,
          available: true,
          price: 20,
          renewalPrice: 20,
          years: 1,
          premium: false,
        })),
      });
    });

    client.setArgv(
      'domains',
      'search',
      'acme',
      '--order=alphabetical',
      '--limit=1'
    );
    expect(await domains(client)).toEqual(0);

    expect(client.stderr.getFullOutput()).toContain(
      'To continue, run `vercel domains search acme --order=alphabetical --next '
    );
  });

  it('preserves exact TLD filters in the human continuation command', async () => {
    client.scenario.get('/v1/registrar/tlds/supported', (_req, res) => {
      res.json(['com', 'dev']);
    });
    client.scenario.post('/v1/registrar/domains/search', (req, res) => {
      const body = req.body as { domains: string[] };
      res.json({
        results: body.domains.map(domain => ({
          domain,
          available: true,
          price: 20,
          renewalPrice: 20,
          years: 1,
          premium: false,
        })),
      });
    });

    client.setArgv(
      'domains',
      'search',
      'acme',
      '--tld=dev',
      '--tld=com',
      '--limit=1'
    );
    expect(await domains(client)).toEqual(0);
    expect(client.stderr.getFullOutput()).toContain(
      'vercel domains search acme --tld=com --tld=dev --next '
    );
  });

  it('filters unavailable candidates from human output and preserves the filter when continuing', async () => {
    client.scenario.get('/v1/registrar/tlds/supported', (_req, res) => {
      res.json(['com', 'dev', 'io']);
    });
    client.scenario.post('/v1/registrar/domains/search', (req, res) => {
      expect(req.body).toEqual({
        domains: ['acme.com', 'acme.dev'],
      });
      res.json({
        results: [
          {
            domain: 'acme.com',
            available: false,
          },
          {
            domain: 'acme.dev',
            available: true,
            price: 20,
            renewalPrice: 25,
            years: 1,
            premium: false,
          },
        ],
      });
    });

    client.setArgv('domains', 'search', 'acme', '--available', '--limit=2');
    expect(await domains(client)).toEqual(0);

    const output = client.stderr.getFullOutput();
    expect(output).toContain('acme.dev');
    expect(output).not.toContain('acme.com');
    expect(output).not.toContain('acme.io');
    expect(output).not.toContain('Unavailable');
    expect(output).toContain(
      'To continue, run `vercel domains search acme --available --next '
    );
  });

  it('keeps unavailable candidates alongside available search results', async () => {
    client.scenario.get('/v1/registrar/tlds/supported', (_req, res) => {
      res.json(['com', 'ca', 'dev']);
    });
    client.scenario.post('/v1/registrar/domains/search', (req, res) => {
      expect(req.body).toEqual({ domains: ['a.com', 'a.ca', 'a.dev'] });
      res.json({
        results: [
          {
            domain: 'a.com',
            available: true,
            price: 20,
            renewalPrice: 25,
            years: 1,
            premium: false,
          },
          {
            domain: 'a.ca',
            available: false,
          },
          {
            domain: 'a.dev',
            available: true,
            price: 20,
            renewalPrice: 25,
            years: 1,
            premium: false,
          },
        ],
      });
    });

    client.setArgv('domains', 'search', 'a', '--format=json');
    expect(await domains(client)).toEqual(0);

    expect(JSON.parse(client.stdout.getFullOutput()).results).toEqual([
      {
        domain: 'a.com',
        available: true,
        purchasePrice: 20,
        renewalPrice: 25,
        years: 1,
      },
      {
        domain: 'a.ca',
        available: false,
        purchasePrice: null,
        renewalPrice: null,
        years: null,
      },
      {
        domain: 'a.dev',
        available: true,
        purchasePrice: 20,
        renewalPrice: 25,
        years: 1,
      },
    ]);
  });

  it('filters only the current JSON page without filling the limit', async () => {
    let searchRequestCount = 0;
    client.scenario.get('/v1/registrar/tlds/supported', (_req, res) => {
      res.json(['com', 'dev', 'io', 'net', 'org']);
    });
    client.scenario.post('/v1/registrar/domains/search', (req, res) => {
      searchRequestCount++;
      expect(req.body).toEqual({
        domains: ['acme.com', 'acme.dev'],
      });
      res.json({
        results: [
          {
            domain: 'acme.com',
            available: false,
          },
          {
            domain: 'acme.dev',
            available: true,
            price: 20,
            renewalPrice: 25,
            years: 1,
            premium: false,
          },
        ],
      });
    });

    client.setArgv(
      'domains',
      'search',
      'acme',
      '--available',
      '--limit=2',
      '--format=json'
    );
    expect(await domains(client)).toEqual(0);

    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(searchRequestCount).toEqual(1);
    expect(payload.results).toEqual([
      {
        domain: 'acme.dev',
        available: true,
        purchasePrice: 20,
        renewalPrice: 25,
        years: 1,
      },
    ]);
    expect(payload.pagination).toEqual({
      next: expect.any(String),
      limit: 2,
    });
  });

  it('returns an empty filtered page without scanning the next window', async () => {
    let searchRequestCount = 0;
    client.scenario.get('/v1/registrar/tlds/supported', (_req, res) => {
      res.json(['com', 'dev', 'io']);
    });
    client.scenario.post('/v1/registrar/domains/search', (req, res) => {
      searchRequestCount++;
      const body = req.body as { domains: string[] };
      expect(body.domains).toEqual(
        searchRequestCount === 1 ? ['acme.com', 'acme.dev'] : ['acme.io']
      );
      res.json({
        results: body.domains.map(domain =>
          searchRequestCount === 1
            ? { domain, available: false }
            : {
                domain,
                available: true,
                price: 20,
                renewalPrice: 25,
                years: 1,
                premium: false,
              }
        ),
      });
    });

    client.setArgv(
      'domains',
      'search',
      'acme',
      '--available',
      '--limit=2',
      '--format=json'
    );
    expect(await domains(client)).toEqual(0);

    const firstOutput = client.stdout.getFullOutput();
    const firstPage = JSON.parse(firstOutput);
    expect(searchRequestCount).toEqual(1);
    expect(firstPage).toEqual({
      query: 'acme',
      order: 'relevance',
      results: [],
      pagination: {
        next: expect.any(String),
        limit: 2,
      },
    });

    client.setArgv(
      'domains',
      'search',
      'acme',
      '--available',
      '--next',
      firstPage.pagination.next,
      '--format=json'
    );
    expect(await domains(client)).toEqual(0);

    expect(searchRequestCount).toEqual(2);
    expect(
      JSON.parse(client.stdout.getFullOutput().slice(firstOutput.length))
        .results
    ).toMatchObject([{ domain: 'acme.io', available: true }]);
  });

  it('outputs API errors as JSON without partial results', async () => {
    client.scenario.get('/v1/registrar/tlds/supported', (_req, res) => {
      res.json(['com']);
    });
    client.scenario.post('/v1/registrar/domains/search', (_req, res) => {
      res.status(400).json({
        error: {
          code: 'unexpected_search_error',
          message: 'Registrar search failed.',
        },
      });
    });

    client.setArgv('domains', 'search', 'acme', '--format=json');
    expect(await domains(client)).toEqual(1);

    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      error: 'unexpected_search_error',
      message: 'Registrar search failed.',
    });
    expect(client.stderr.getFullOutput()).toEqual('');
  });

  it('fails without partial output for a malformed TLD response', async () => {
    client.scenario.get('/v1/registrar/tlds/supported', (_req, res) => {
      res.json({ results: ['com'] });
    });

    client.setArgv('domains', 'search', 'acme', '--format=json');
    expect(await domains(client)).toEqual(1);

    expect(client.stdout.getFullOutput()).toEqual('');
  });

  it('fails without partial output for a malformed search response', async () => {
    client.scenario.get('/v1/registrar/tlds/supported', (_req, res) => {
      res.json(['com']);
    });
    client.scenario.post('/v1/registrar/domains/search', (_req, res) => {
      res.json({ quotes: [] });
    });

    client.setArgv('domains', 'search', 'acme', '--format=json');
    expect(await domains(client)).toEqual(1);

    expect(client.stdout.getFullOutput()).toEqual('');
  });

  it('fails without partial output when a search response is incomplete', async () => {
    client.scenario.get('/v1/registrar/tlds/supported', (_req, res) => {
      res.json(['com', 'dev']);
    });
    client.scenario.post('/v1/registrar/domains/search', (_req, res) => {
      res.json({
        results: [
          {
            domain: 'acme.com',
            available: true,
            price: 20,
            renewalPrice: 20,
            years: 1,
            premium: false,
          },
        ],
      });
    });

    client.setArgv('domains', 'search', 'acme', '--format=json');
    expect(await domains(client)).toEqual(1);

    expect(client.stdout.getFullOutput()).toEqual('');
    expect(client.stderr.getFullOutput()).toContain(
      'Missing registrar search result for acme.dev'
    );
  });

  it('orders multi-label fragment results alphabetically', async () => {
    client.scenario.get('/v1/registrar/tlds/supported', (req, res) => {
      const unsortedTlds = ['com', 'co.uk', 'co.ug'];
      res.json(
        req.query.order === 'alphabetical'
          ? [...unsortedTlds].sort()
          : unsortedTlds
      );
    });
    client.scenario.post('/v1/registrar/domains/search', (req, res) => {
      const body = req.body as { domains?: string[] };
      res.json({
        results: body.domains?.map(domain => ({
          domain,
          available: true,
          price: 20,
          renewalPrice: 20,
          years: 1,
          premium: false,
        })),
      });
    });

    client.setArgv(
      'domains',
      'search',
      'acme.co.u',
      '--order=alphabetical',
      '--limit=1',
      '--format=json'
    );
    expect(await domains(client)).toEqual(0);

    const payload = JSON.parse(client.stdout.getFullOutput());
    expect(payload.query).toEqual('acme.co.u');
    expect(payload.order).toEqual('alphabetical');
    expect(
      payload.results.map((result: { domain: string }) => result.domain)
    ).toEqual(['acme.co.ug']);
    expect(payload.pagination.limit).toEqual(1);
    expect(payload.pagination.next).toEqual(expect.any(String));
  });

  it('orders results by TLD length', async () => {
    client.scenario.get('/v1/registrar/tlds/supported', (req, res) => {
      const unsortedTlds = ['technology', 'dev', 'io', 'com'];
      res.json(
        req.query.order === 'length'
          ? [...unsortedTlds].sort(
              (a, b) => a.length - b.length || a.localeCompare(b)
            )
          : unsortedTlds
      );
    });
    client.scenario.post('/v1/registrar/domains/search', (req, res) => {
      const body = req.body as { domains?: string[] };
      res.json({
        results: body.domains?.map(domain => ({
          domain,
          available: true,
          price: 20,
          renewalPrice: 20,
          years: 1,
          premium: false,
        })),
      });
    });

    client.setArgv(
      'domains',
      'search',
      'acme',
      '--order=length',
      '--format=json'
    );
    expect(await domains(client)).toEqual(0);
    expect(
      JSON.parse(client.stdout.getFullOutput()).results.map(
        (result: { domain: string }) => result.domain
      )
    ).toEqual(['acme.io', 'acme.com', 'acme.dev', 'acme.technology']);
  });

  it('rejects an invalid order', async () => {
    client.setArgv('domains', 'search', 'acme', '--order=recent');

    expect(await domains(client)).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain('Invalid order: "recent"');
  });

  it('rejects the deprecated --json alias', async () => {
    client.setArgv('domains', 'search', 'acme', '--json');

    expect(await domains(client)).toEqual(1);
    expect(client.stdout.getFullOutput()).toEqual('');
    expect(client.stderr.getFullOutput()).toContain('--json');
  });

  it.each([0, 201])('rejects invalid limit boundary %i', async limit => {
    client.setArgv('domains', 'search', 'acme', `--limit=${limit}`);

    expect(await domains(client)).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Provide a number from 1 to 200'
    );
  });

  it.each([1, 200])('accepts limit boundary %i', async limit => {
    const tlds = Array.from({ length: limit }, (_, index) => `tld${index}`);

    client.scenario.get('/v1/registrar/tlds/supported', (_req, res) => {
      res.json(tlds);
    });
    client.scenario.post('/v1/registrar/domains/search', (req, res) => {
      const body = req.body as { domains?: string[] };
      res.json({
        results: body.domains?.map(domain => ({
          domain,
          available: true,
          price: 20,
          renewalPrice: 20,
          years: 1,
          premium: false,
        })),
      });
    });

    client.setArgv('domains', 'search', 'acme', `--limit=${limit}`);
    expect(await domains(client)).toEqual(0);

    expect(client.stderr.getFullOutput()).toContain(`acme.tld${limit - 1}`);
  });

  it('rejects a malformed continuation cursor', async () => {
    client.setArgv('domains', 'search', 'acme', '--next', 'not-a-cursor');

    expect(await domains(client)).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Invalid continuation cursor'
    );
  });

  it('rejects a continuation cursor without availability state', async () => {
    const cursor = Buffer.from(
      JSON.stringify({
        query: 'acme',
        fragment: null,
        order: 'relevance',
        tlds: [],
        lastTld: 'com',
      }),
      'utf8'
    ).toString('base64url');

    client.setArgv('domains', 'search', 'acme', '--next', cursor);
    expect(await domains(client)).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Invalid continuation cursor'
    );
  });

  it('rejects a continuation cursor when the query changes', async () => {
    client.scenario.get('/v1/registrar/tlds/supported', (_req, res) => {
      res.json(['com', 'dev']);
    });
    client.scenario.post('/v1/registrar/domains/search', (req, res) => {
      const body = req.body as { domains?: string[] };
      res.json({
        results: body.domains?.map(domain => ({
          domain,
          available: true,
          price: 20,
          renewalPrice: 20,
          years: 1,
          premium: false,
        })),
      });
    });

    client.setArgv('domains', 'search', 'acme', '--limit=1', '--format=json');
    expect(await domains(client)).toEqual(0);
    const cursor = JSON.parse(client.stdout.getFullOutput()).pagination.next;

    client.setArgv('domains', 'search', 'other', '--next', cursor);

    expect(await domains(client)).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain(
      'does not match the current query'
    );
  });

  it.each([
    { firstPageFlag: '--available', continuationFlag: undefined },
    { firstPageFlag: undefined, continuationFlag: '--available' },
  ])('rejects a continuation cursor when the availability filter changes', async ({
    firstPageFlag,
    continuationFlag,
  }) => {
    client.scenario.get('/v1/registrar/tlds/supported', (_req, res) => {
      res.json(['com', 'dev']);
    });
    client.scenario.post('/v1/registrar/domains/search', (req, res) => {
      const body = req.body as { domains: string[] };
      res.json({
        results: body.domains.map(domain => ({
          domain,
          available: true,
          price: 20,
          renewalPrice: 20,
          years: 1,
          premium: false,
        })),
      });
    });

    client.setArgv(
      'domains',
      'search',
      'acme',
      ...(firstPageFlag ? [firstPageFlag] : []),
      '--limit=1',
      '--format=json'
    );
    expect(await domains(client)).toEqual(0);
    const cursor = JSON.parse(client.stdout.getFullOutput()).pagination.next;

    client.setArgv(
      'domains',
      'search',
      'acme',
      ...(continuationFlag ? [continuationFlag] : []),
      '--next',
      cursor
    );
    expect(await domains(client)).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain(
      'does not match the current query, order, or filters'
    );
  });

  it('accepts reordered exact TLD filters with a continuation cursor', async () => {
    client.scenario.get('/v1/registrar/tlds/supported', (_req, res) => {
      res.json(['com', 'dev']);
    });
    client.scenario.post('/v1/registrar/domains/search', (req, res) => {
      const body = req.body as { domains: string[] };
      res.json({
        results: body.domains.map(domain => ({
          domain,
          available: true,
          price: 20,
          renewalPrice: 20,
          years: 1,
          premium: false,
        })),
      });
    });

    client.setArgv(
      'domains',
      'search',
      'acme',
      '--tld=dev',
      '--tld=com',
      '--limit=1',
      '--format=json'
    );
    expect(await domains(client)).toEqual(0);
    const firstOutput = client.stdout.getFullOutput();
    const cursor = JSON.parse(firstOutput).pagination.next;

    client.setArgv(
      'domains',
      'search',
      'acme',
      '--tld=com',
      '--tld=dev',
      '--next',
      cursor,
      '--format=json'
    );
    expect(await domains(client)).toEqual(0);
    expect(
      JSON.parse(client.stdout.getFullOutput().slice(firstOutput.length))
        .results
    ).toMatchObject([{ domain: 'acme.dev' }]);
  });

  it('rejects a continuation cursor when exact TLD filters change', async () => {
    client.scenario.get('/v1/registrar/tlds/supported', (_req, res) => {
      res.json(['com', 'dev']);
    });
    client.scenario.post('/v1/registrar/domains/search', (req, res) => {
      const body = req.body as { domains: string[] };
      res.json({
        results: body.domains.map(domain => ({
          domain,
          available: true,
          price: 20,
          renewalPrice: 20,
          years: 1,
          premium: false,
        })),
      });
    });

    client.setArgv(
      'domains',
      'search',
      'acme',
      '--tld=com',
      '--tld=dev',
      '--limit=1',
      '--format=json'
    );
    expect(await domains(client)).toEqual(0);
    const cursor = JSON.parse(client.stdout.getFullOutput()).pagination.next;

    client.setArgv('domains', 'search', 'acme', '--tld=com', '--next', cursor);
    expect(await domains(client)).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain('or filters');
  });

  it.each([
    '',
    '.',
    'co..uk',
    '-com',
    'com/',
  ])('rejects invalid exact TLD filter %j', async tld => {
    client.setArgv('domains', 'search', 'acme', `--tld=${tld}`);

    expect(await domains(client)).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain('Invalid TLD filter');
  });

  it('rejects stale continuation cursors', async () => {
    const now = Date.now();
    const dateNow = vi.spyOn(Date, 'now').mockReturnValue(now);
    let catalogRequestCount = 0;
    client.scenario.get('/v1/registrar/tlds/supported', (_req, res) => {
      catalogRequestCount++;
      res.json(catalogRequestCount === 1 ? ['com', 'dev'] : ['dev']);
    });
    client.scenario.post('/v1/registrar/domains/search', (req, res) => {
      const body = req.body as { domains?: string[] };
      res.json({
        results: body.domains?.map(domain => ({
          domain,
          available: true,
          price: 20,
          renewalPrice: 20,
          years: 1,
          premium: false,
        })),
      });
    });

    client.setArgv('domains', 'search', 'acme', '--limit=1', '--format=json');
    expect(await domains(client)).toEqual(0);
    const cursor = JSON.parse(client.stdout.getFullOutput()).pagination.next;

    dateNow.mockReturnValue(now + 30 * 60 * 1000 + 1);
    client.setArgv('domains', 'search', 'acme', '--next', cursor);

    expect(await domains(client)).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain(
      'continuation cursor is stale'
    );
  });

  it.each([
    ['', 'Query cannot be empty'],
    ['https://vercel.com', 'URLs are not supported'],
    ['acme domains', 'whitespace'],
    ['acme-', 'Invalid keyword'],
    ['acme_', 'Invalid keyword'],
    ['café', 'ASCII'],
    ['acme..dev', 'Invalid TLD fragment'],
    ['acme.', 'Invalid TLD fragment'],
  ])('rejects unsupported query %j', async (query, expectedError) => {
    client.setArgv('domains', 'search', query);

    expect(await domains(client)).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain(expectedError);
  });
});
