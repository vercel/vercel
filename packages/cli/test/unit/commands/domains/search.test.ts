import { describe, expect, it } from 'vitest';
import domains from '../../../../src/commands/domains';
import { client } from '../../../mocks/client';

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
    client.scenario.post('/v1/registrar/domains/price', (_req, res) => {
      res.json({
        results: [
          {
            domain: 'acme.com',
            purchasePrice: 20,
            renewalPrice: 20,
            transferPrice: 20,
            years: 1,
          },
          {
            domain: 'acme.dev',
            purchasePrice: null,
            renewalPrice: 30,
            transferPrice: null,
            years: 1,
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
            "renewalPrice": 30,
            "years": 1
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

  it('narrows TLD fragments and renders action-oriented human output', async () => {
    client.scenario.get('/v1/registrar/tlds/supported', (_req, res) => {
      res.json(['co.uk', 'com', 'co', 'company']);
    });
    client.scenario.post('/v1/registrar/domains/price', (_req, res) => {
      res.json({
        results: [
          {
            domain: 'acme.co',
            purchasePrice: 25,
            renewalPrice: 40,
            transferPrice: 30,
            years: 2,
          },
          {
            domain: 'acme.co.uk',
            purchasePrice: null,
            renewalPrice: 33,
            transferPrice: null,
            years: 1,
          },
          {
            domain: 'acme.com',
            purchasePrice: null,
            renewalPrice: 22,
            transferPrice: null,
            years: 1,
          },
          {
            domain: 'acme.company',
            purchasePrice: 18,
            renewalPrice: 24,
            transferPrice: 20,
            years: 1,
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
    client.scenario.post('/v1/registrar/domains/price', (req, res) => {
      const body = req.body as { domains?: string[] };
      res.json({
        results: body.domains?.map(domain => ({
          domain,
          purchasePrice: 20,
          renewalPrice: 25,
          transferPrice: 30,
          years: 1,
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

  it('accepts bulk quote responses returned as an array', async () => {
    client.scenario.get('/v1/registrar/tlds/supported', (_req, res) => {
      res.json(['com', 'dev']);
    });
    client.scenario.post('/v1/registrar/domains/price', (_req, res) => {
      res.json([
        {
          domain: 'acme.com',
          purchasePrice: 20,
          renewalPrice: 20,
          transferPrice: 20,
          years: 1,
        },
        {
          domain: 'acme.dev',
          purchasePrice: null,
          renewalPrice: 30,
          transferPrice: null,
          years: 1,
        },
      ]);
    });

    client.setArgv('domains', 'search', 'acme', '--format=json');
    expect(await domains(client)).toEqual(0);

    expect(JSON.parse(client.stdout.getFullOutput()).results).toEqual([
      {
        domain: 'acme.com',
        available: true,
        purchasePrice: 20,
        renewalPrice: 20,
        years: 1,
      },
      {
        domain: 'acme.dev',
        available: false,
        purchasePrice: null,
        renewalPrice: 30,
        years: 1,
      },
    ]);
  });

  it('continues after the last TLD with a different valid limit', async () => {
    client.scenario.get('/v1/registrar/tlds/supported', (_req, res) => {
      res.json(['com', 'dev', 'io', 'net']);
    });
    client.scenario.post('/v1/registrar/domains/price', (req, res) => {
      const body = req.body as { domains?: string[] };
      res.json({
        results: body.domains?.map(domain => ({
          domain,
          purchasePrice: 20,
          renewalPrice: 20,
          transferPrice: 20,
          years: 1,
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
    let catalogRequestCount = 0;
    client.scenario.get('/v1/registrar/tlds/supported', (_req, res) => {
      catalogRequestCount++;
      res.json(
        catalogRequestCount === 1 ? ['com', 'dev', 'io'] : ['com', 'dev']
      );
    });
    client.scenario.post('/v1/registrar/domains/price', (req, res) => {
      const body = req.body as { domains?: string[] };
      res.json({
        results: body.domains?.map(domain => ({
          domain,
          purchasePrice: 20,
          renewalPrice: 20,
          transferPrice: 20,
          years: 1,
        })),
      });
    });

    client.setArgv('domains', 'search', 'acme', '--limit=2', '--format=json');
    expect(await domains(client)).toEqual(0);
    const firstOutput = client.stdout.getFullOutput();
    const cursor = JSON.parse(firstOutput).pagination.next;

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
    client.scenario.post('/v1/registrar/domains/price', (req, res) => {
      const body = req.body as { domains?: string[] };
      res.json({
        results: body.domains?.map(domain => ({
          domain,
          purchasePrice: 20,
          renewalPrice: 20,
          transferPrice: 20,
          years: 1,
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
    client.scenario.post('/v1/registrar/domains/price', (req, res) => {
      const body = req.body as { domains?: string[] };
      res.json({
        results: body.domains?.map(domain => ({
          domain,
          purchasePrice: 20,
          renewalPrice: 20,
          transferPrice: 20,
          years: 1,
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

  it('isolates registry-invalid candidates without losing valid quotes', async () => {
    client.scenario.get('/v1/registrar/tlds/supported', (_req, res) => {
      res.json(['com', 'ca', 'dev']);
    });
    client.scenario.post('/v1/registrar/domains/price', (req, res) => {
      const body = req.body as { domains?: string[] };

      if (body.domains?.includes('a.ca')) {
        res.status(400).json({
          error: {
            code: 'domain_too_short',
            message: 'The domain name a.ca is too short.',
          },
        });
        return;
      }

      res.json({
        results: body.domains?.map(domain => ({
          domain,
          purchasePrice: 20,
          renewalPrice: 25,
          transferPrice: 30,
          years: 1,
        })),
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

  it('outputs API errors as JSON without partial results', async () => {
    client.scenario.get('/v1/registrar/tlds/supported', (_req, res) => {
      res.json(['com']);
    });
    client.scenario.post('/v1/registrar/domains/price', (_req, res) => {
      res.status(400).json({
        error: {
          code: 'unexpected_quote_error',
          message: 'Registrar quote failed.',
        },
      });
    });

    client.setArgv('domains', 'search', 'acme', '--format=json');
    expect(await domains(client)).toEqual(1);

    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({
      error: 'unexpected_quote_error',
      message: 'Registrar quote failed.',
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

  it('fails without partial output for a malformed quote response', async () => {
    client.scenario.get('/v1/registrar/tlds/supported', (_req, res) => {
      res.json(['com']);
    });
    client.scenario.post('/v1/registrar/domains/price', (_req, res) => {
      res.json({ quotes: [] });
    });

    client.setArgv('domains', 'search', 'acme', '--format=json');
    expect(await domains(client)).toEqual(1);

    expect(client.stdout.getFullOutput()).toEqual('');
  });

  it('fails without partial output when a quote response is incomplete', async () => {
    client.scenario.get('/v1/registrar/tlds/supported', (_req, res) => {
      res.json(['com', 'dev']);
    });
    client.scenario.post('/v1/registrar/domains/price', (_req, res) => {
      res.json({
        results: [
          {
            domain: 'acme.com',
            purchasePrice: 20,
            renewalPrice: 20,
            transferPrice: 20,
            years: 1,
          },
        ],
      });
    });

    client.setArgv('domains', 'search', 'acme', '--format=json');
    expect(await domains(client)).toEqual(1);

    expect(client.stdout.getFullOutput()).toEqual('');
    expect(client.stderr.getFullOutput()).toContain(
      'Missing registrar quote for acme.dev'
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
    client.scenario.post('/v1/registrar/domains/price', (req, res) => {
      const body = req.body as { domains?: string[] };
      res.json({
        results: body.domains?.map(domain => ({
          domain,
          purchasePrice: 20,
          renewalPrice: 20,
          transferPrice: 20,
          years: 1,
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
    client.scenario.post('/v1/registrar/domains/price', (req, res) => {
      const body = req.body as { domains?: string[] };
      res.json({
        results: body.domains?.map(domain => ({
          domain,
          purchasePrice: 20,
          renewalPrice: 20,
          transferPrice: 20,
          years: 1,
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

  it.each([0, 51])('rejects invalid limit boundary %i', async limit => {
    client.setArgv('domains', 'search', 'acme', `--limit=${limit}`);

    expect(await domains(client)).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain(
      'Provide a number from 1 to 50'
    );
  });

  it.each([1, 50])('accepts limit boundary %i', async limit => {
    const tlds = Array.from({ length: limit }, (_, index) => `tld${index}`);

    client.scenario.get('/v1/registrar/tlds/supported', (_req, res) => {
      res.json(tlds);
    });
    client.scenario.post('/v1/registrar/domains/price', (req, res) => {
      const body = req.body as { domains?: string[] };
      res.json({
        results: body.domains?.map(domain => ({
          domain,
          purchasePrice: 20,
          renewalPrice: 20,
          transferPrice: 20,
          years: 1,
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

  it('rejects a continuation cursor when the query changes', async () => {
    client.scenario.get('/v1/registrar/tlds/supported', (_req, res) => {
      res.json(['com', 'dev']);
    });
    client.scenario.post('/v1/registrar/domains/price', (req, res) => {
      const body = req.body as { domains?: string[] };
      res.json({
        results: body.domains?.map(domain => ({
          domain,
          purchasePrice: 20,
          renewalPrice: 20,
          transferPrice: 20,
          years: 1,
        })),
      });
    });

    client.setArgv('domains', 'search', 'acme', '--limit=1', '--format=json');
    expect(await domains(client)).toEqual(0);
    const cursor = JSON.parse(client.stdout.getFullOutput()).pagination.next;

    client.setArgv('domains', 'search', 'other', '--next', cursor);

    expect(await domains(client)).toEqual(1);
    expect(client.stderr.getFullOutput()).toContain(
      'does not match the current query or order'
    );
  });

  it('rejects stale continuation cursors', async () => {
    let catalogRequestCount = 0;
    client.scenario.get('/v1/registrar/tlds/supported', (_req, res) => {
      catalogRequestCount++;
      res.json(catalogRequestCount === 1 ? ['com', 'dev'] : ['dev']);
    });
    client.scenario.post('/v1/registrar/domains/price', (req, res) => {
      const body = req.body as { domains?: string[] };
      res.json({
        results: body.domains?.map(domain => ({
          domain,
          purchasePrice: 20,
          renewalPrice: 20,
          transferPrice: 20,
          years: 1,
        })),
      });
    });

    client.setArgv('domains', 'search', 'acme', '--limit=1', '--format=json');
    expect(await domains(client)).toEqual(0);
    const cursor = JSON.parse(client.stdout.getFullOutput()).pagination.next;

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
