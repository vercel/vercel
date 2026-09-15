import { afterEach, describe, expect, it, vi } from 'vitest';
import changelog from '../../../../src/commands/changelog';
import ua from '../../../../src/util/ua';
import { client } from '../../../mocks/client';

const items = [
  {
    authors: [],
    content:
      'Harnesses now support **ACP-compatible** agents.\n\n- Works with the AI SDK',
    publishedAt: '2026-08-13T12:00:00.000Z',
    slug: 'ai-sdk-harness-layer',
    summary: 'AI SDK harnesses work with ACP-compatible agents.',
    title: 'Use ACP-compatible harnesses with the AI SDK harness layer',
    url: 'https://vercel.com/changelog/ai-sdk-harness-layer',
  },
];

function mockResponse(body: unknown, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('changelog', () => {
  it('shows recent entries without custom gate or authorization headers', async () => {
    const fetchMock = mockResponse({ items });
    client.setArgv('changelog');

    expect(await changelog(client)).toBe(0);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      'https://vercel.com/api/changelog?limit=5&include=content'
    );
    const headers = new Headers(init?.headers);
    expect(headers.get('user-agent')).toBe(ua);
    expect(headers.has('client-id')).toBe(false);
    expect(headers.has('x-vercel-cli')).toBe(false);
    expect(headers.has('authorization')).toBe(false);
    expect(client.getFullOutput()).toContain(
      'Aug 13  Use ACP-compatible harnesses with the AI SDK harness layer'
    );
    expect(client.getFullOutput()).toContain(items[0].url);
    expect(client.getFullOutput()).toContain(items[0].content);
  });

  it('supports the --changelog alias', async () => {
    mockResponse({ items });
    client.setArgv('--changelog');

    expect(await changelog(client)).toBe(0);
    expect(client.getFullOutput()).toContain(items[0].title);
  });

  it('searches with a multi-word query', async () => {
    const fetchMock = mockResponse({ items, query: 'AI SDK' });
    client.setArgv('changelog', 'search', 'AI', 'SDK');

    expect(await changelog(client)).toBe(0);

    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      'https://vercel.com/api/changelog/search?limit=5&q=AI+SDK'
    );
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'subcommand:search', value: 'search' },
    ]);
    expect(client.getFullOutput()).toContain(items[0].content);
    expect(client.getFullOutput()).not.toContain(items[0].summary);
  });

  it('requires a search query', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    client.setArgv('changelog', 'search');

    expect(await changelog(client)).toBe(1);
    expect(client.getFullOutput()).toContain('Search query is required.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid limit', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    client.setArgv('changelog', '--limit', '21');

    expect(await changelog(client)).toBe(1);
    expect(client.getFullOutput()).toContain(
      '--limit must be between 1 and 20.'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('handles an empty response', async () => {
    mockResponse({ items: [] });
    client.setArgv('changelog');

    expect(await changelog(client)).toBe(0);
    expect(client.getFullOutput()).toContain('No changelog entries found.');
  });

  it('outputs stable JSON without human output', async () => {
    mockResponse({ items, pagination: { hasMore: false } });
    client.setArgv('changelog', '--format', 'json');

    expect(await changelog(client)).toBe(0);
    expect(JSON.parse(client.stdout.getFullOutput())).toEqual({ items });
    expect(client.getFullOutput()).toBe('');
    expect(client.telemetryEventStore).toHaveTelemetryEvents([
      { key: 'option:format', value: 'json' },
    ]);
  });

  it('rejects an invalid output format', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    client.setArgv('changelog', '--format', 'yaml');

    expect(await changelog(client)).toBe(1);
    expect(client.getFullOutput()).toContain('Invalid output format: "yaml"');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('handles rate limits', async () => {
    mockResponse(
      { error: { code: 'rate_limited', message: 'Too many requests' } },
      429
    );
    client.setArgv('changelog', 'search', 'AI');

    expect(await changelog(client)).toBe(1);
    expect(client.getFullOutput()).toContain(
      'Too many changelog requests. Try again shortly.'
    );
  });

  it('shows command help', async () => {
    client.setArgv('changelog', '--help');

    expect(await changelog(client)).toBe(0);
    expect(client.getFullOutput()).toContain(
      'Show the latest Vercel product updates'
    );
    expect(client.getFullOutput()).toContain('changelog search');
    expect(client.getFullOutput()).toContain(
      'Number of updates to show (default: 5, max: 20)'
    );
    expect(client.getFullOutput()).toContain('vercel --changelog');
  });

  it('shows search help for agents', async () => {
    client.setArgv('changelog', 'search', '--help');

    expect(await changelog(client)).toBe(0);
    expect(client.getFullOutput()).toContain(
      'Search Vercel product updates by keyword'
    );
    expect(client.getFullOutput()).toContain(
      'vercel changelog search "Fluid compute"'
    );
    expect(client.getFullOutput()).toContain(
      'Number of updates to show (default: 5, max: 20)'
    );
  });
});
