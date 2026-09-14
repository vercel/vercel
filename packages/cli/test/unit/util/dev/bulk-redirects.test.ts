import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  appendQueryParams,
  BulkRedirectTable,
  hostnameFromHostHeader,
  loadBulkRedirects,
  resolveBulkRedirect,
} from '../../../../src/util/dev/bulk-redirects';

async function createProject(): Promise<string> {
  return mkdtemp(join(tmpdir(), 'vc-bulk-redirects-'));
}

describe('BulkRedirectTable', () => {
  it('matches a path-only source', () => {
    const table = new BulkRedirectTable();
    table.add({
      source: '/old-blog',
      destination: '/blog',
      statusCode: 307,
      caseSensitive: false,
      preserveQueryParams: false,
    });

    expect(table.lookup('/old-blog')).toMatchObject({
      destination: '/blog',
      statusCode: 307,
    });
    expect(table.lookup('/missing')).toBeUndefined();
  });

  it('matches case-insensitively by default', () => {
    const table = new BulkRedirectTable();
    table.add({
      source: '/Old-Blog',
      destination: '/blog',
      statusCode: 308,
      caseSensitive: false,
      preserveQueryParams: false,
    });

    expect(table.lookup('/old-blog')?.destination).toBe('/blog');
    expect(table.lookup('/OLD-BLOG')?.destination).toBe('/blog');
  });

  it('matches case-sensitively when enabled', () => {
    const table = new BulkRedirectTable();
    table.add({
      source: '/Old-Blog',
      destination: '/blog',
      statusCode: 308,
      caseSensitive: true,
      preserveQueryParams: false,
    });

    expect(table.lookup('/Old-Blog')?.destination).toBe('/blog');
    expect(table.lookup('/old-blog')).toBeUndefined();
  });

  it('matches a fully qualified source against the Host header', () => {
    const table = new BulkRedirectTable();
    table.add({
      source: 'https://old-domain.com/page',
      destination: '/new-page',
      statusCode: 308,
      caseSensitive: false,
      preserveQueryParams: false,
    });

    expect(table.lookup('/page', 'old-domain.com:443')?.destination).toBe(
      '/new-page'
    );
    expect(table.lookup('/page', 'localhost:3000')).toBeUndefined();
    expect(table.lookup('/page')).toBeUndefined();
  });

  it('prefers a host-specific match over a path-only match', () => {
    const table = new BulkRedirectTable();
    table.add({
      source: '/page',
      destination: '/generic',
      statusCode: 307,
      caseSensitive: false,
      preserveQueryParams: false,
    });
    table.add({
      source: 'https://old-domain.com/page',
      destination: '/specific',
      statusCode: 308,
      caseSensitive: false,
      preserveQueryParams: false,
    });

    expect(table.lookup('/page', 'old-domain.com')?.destination).toBe(
      '/specific'
    );
    expect(table.lookup('/page', 'localhost')?.destination).toBe('/generic');
  });
});

describe('resolveBulkRedirect', () => {
  it('drops query params by default', () => {
    const table = new BulkRedirectTable();
    table.add({
      source: '/old',
      destination: '/new',
      statusCode: 307,
      caseSensitive: false,
      preserveQueryParams: false,
    });

    expect(resolveBulkRedirect(table, '/old?foo=1')).toEqual({
      location: '/new',
      statusCode: 307,
    });
  });

  it('preserves query params when enabled', () => {
    const table = new BulkRedirectTable();
    table.add({
      source: '/old',
      destination: '/new?bar=2',
      statusCode: 301,
      caseSensitive: false,
      preserveQueryParams: true,
    });

    expect(resolveBulkRedirect(table, '/old?foo=1')).toEqual({
      location: '/new?bar=2&foo=1',
      statusCode: 301,
    });
  });
});

describe('appendQueryParams', () => {
  it('appends to destinations without a query string', () => {
    expect(appendQueryParams('/new', '?foo=1')).toBe('/new?foo=1');
  });

  it('merges onto destinations that already have a query string', () => {
    expect(appendQueryParams('/new?bar=2', '?foo=1')).toBe('/new?bar=2&foo=1');
  });
});

describe('hostnameFromHostHeader', () => {
  it('strips a port from an IPv4 host', () => {
    expect(hostnameFromHostHeader('localhost:3000')).toBe('localhost');
  });

  it('parses an IPv6 host', () => {
    expect(hostnameFromHostHeader('[::1]:3000')).toBe('::1');
  });
});

describe('loadBulkRedirects', () => {
  it('loads redirects from a JSON file', async () => {
    const cwd = await createProject();
    await writeFile(
      join(cwd, 'redirects.json'),
      JSON.stringify([
        { source: '/old-blog', destination: '/blog', permanent: true },
        { source: '/old-about', destination: '/about' },
      ])
    );

    const result = await loadBulkRedirects(cwd, 'redirects.json');
    expect(result.redirectCount).toBe(2);
    expect(result.warnings).toEqual([]);
    expect(result.table.lookup('/old-blog')).toMatchObject({
      destination: '/blog',
      statusCode: 308,
    });
    expect(result.table.lookup('/old-about')).toMatchObject({
      destination: '/about',
      statusCode: 307,
    });
  });

  it('loads redirects from a JSONL file', async () => {
    const cwd = await createProject();
    await writeFile(
      join(cwd, 'redirects.jsonl'),
      [
        JSON.stringify({
          source: '/old-blog',
          destination: '/blog',
          statusCode: 301,
        }),
        JSON.stringify({
          source: '/legacy-contact',
          destination: 'https://example.com/contact',
        }),
      ].join('\n')
    );

    const result = await loadBulkRedirects(cwd, 'redirects.jsonl');
    expect(result.redirectCount).toBe(2);
    expect(result.table.lookup('/old-blog')?.statusCode).toBe(301);
    expect(result.table.lookup('/legacy-contact')?.destination).toBe(
      'https://example.com/contact'
    );
  });

  it('loads redirects from a CSV file with compact booleans', async () => {
    const cwd = await createProject();
    await writeFile(
      join(cwd, 'redirects.csv'),
      [
        'destination,source,permanent,caseSensitive,preserveQueryParams',
        '/blog,/old-blog,t,f,t',
        'https://example.com/about,/old-about,false,,',
      ].join('\n')
    );

    const result = await loadBulkRedirects(cwd, 'redirects.csv');
    expect(result.redirectCount).toBe(2);
    expect(result.table.lookup('/old-blog')).toMatchObject({
      destination: '/blog',
      statusCode: 308,
      preserveQueryParams: true,
    });
    expect(result.table.lookup('/old-about')?.statusCode).toBe(307);
  });

  it('loads all supported files from a directory', async () => {
    const cwd = await createProject();
    const dir = join(cwd, 'redirects');
    await mkdir(join(dir, 'nested'), { recursive: true });
    await writeFile(
      join(dir, 'a.json'),
      JSON.stringify([{ source: '/a', destination: '/one' }])
    );
    await writeFile(
      join(dir, 'nested', 'b.jsonl'),
      JSON.stringify({ source: '/b', destination: '/two' })
    );
    await writeFile(join(dir, 'c.csv'), 'source,destination\n/c,/three\n');

    const result = await loadBulkRedirects(cwd, 'redirects');
    expect(result.redirectCount).toBe(3);
    expect(result.fileCount).toBe(3);
    expect(result.table.lookup('/a')?.destination).toBe('/one');
    expect(result.table.lookup('/b')?.destination).toBe('/two');
    expect(result.table.lookup('/c')?.destination).toBe('/three');
  });

  it('rejects a path that escapes the project directory', async () => {
    const cwd = await createProject();
    const result = await loadBulkRedirects(cwd, '../outside.json');
    expect(result.redirectCount).toBe(0);
    expect(result.warnings[0]).toMatch(/outside the project directory/);
  });

  it('warns when the bulk redirects path is missing', async () => {
    const cwd = await createProject();
    const result = await loadBulkRedirects(cwd, 'missing.json');
    expect(result.redirectCount).toBe(0);
    expect(result.warnings[0]).toMatch(/was not found/);
  });

  it('warns about duplicate sources and lets the last one win', async () => {
    const cwd = await createProject();
    await writeFile(
      join(cwd, 'redirects.json'),
      JSON.stringify([
        { source: '/dup', destination: '/first' },
        { source: '/dup', destination: '/second' },
        { source: '/unique', destination: '/other' },
      ])
    );

    const result = await loadBulkRedirects(cwd, 'redirects.json');
    expect(result.redirectCount).toBe(3);
    expect(result.table.size).toBe(2);
    expect(result.table.lookup('/dup')?.destination).toBe('/second');
    expect(result.warnings).toEqual([
      expect.stringMatching(/1 duplicate source; the last occurrence wins/),
    ]);
  });

  it('skips invalid rows and keeps valid ones', async () => {
    const cwd = await createProject();
    await writeFile(
      join(cwd, 'redirects.json'),
      JSON.stringify([
        { source: '/ok', destination: '/yes' },
        { source: '/bad' },
        { source: '/nope', destination: '/x', statusCode: 200 },
      ])
    );

    const result = await loadBulkRedirects(cwd, 'redirects.json');
    expect(result.redirectCount).toBe(1);
    expect(result.table.lookup('/ok')?.destination).toBe('/yes');
    expect(result.warnings).toHaveLength(2);
  });
});
