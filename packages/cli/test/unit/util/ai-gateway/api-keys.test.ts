import { describe, expect, it } from 'vitest';
import { client } from '../../../mocks/client';
import {
  describeApiKeyLookupError,
  findApiKeyByIdOrName,
} from '../../../../src/util/ai-gateway/api-keys';

const key = (id: string, name: string) => ({ id, name, purpose: 'ai-gateway' });

// The id lookup misses, so resolution falls through to the name search.
function useMissingIdLookup() {
  client.scenario.get('/v1/api-keys/:id', (_req, res) => {
    res
      .status(404)
      .json({ error: { code: 'not_found', message: 'Not found' } });
  });
}

// Serves `pages` in order, keyed by the `until` cursor, and records queries.
function useKeyPages(pages: { apiKeys: unknown[]; next: string | null }[]) {
  const queries: Record<string, unknown>[] = [];
  client.scenario.get('/v1/api-keys', (req, res) => {
    queries.push(req.query as Record<string, unknown>);
    const index = req.query.until ? Number(req.query.until) : 0;
    const page = pages[index];
    res.json({
      apiKeys: page.apiKeys,
      pagination: { count: page.apiKeys.length, next: page.next, prev: null },
    });
  });
  return queries;
}

describe('findApiKeyByIdOrName', () => {
  it('searches by name and finds a key past the first page', async () => {
    useMissingIdLookup();
    const queries = useKeyPages([
      { apiKeys: [key('key_1', 'staging-old')], next: '1' },
      { apiKeys: [key('key_2', 'staging')], next: null },
    ]);

    const resolved = await findApiKeyByIdOrName(client, 'staging');

    expect(resolved).toEqual({ apiKey: key('key_2', 'staging') });
    expect(queries).toEqual([
      { purpose: 'ai-gateway', limit: '100', search: 'staging' },
      { purpose: 'ai-gateway', limit: '100', search: 'staging', until: '1' },
    ]);
  });

  it('reports duplicate names across pages as ambiguous', async () => {
    useMissingIdLookup();
    useKeyPages([
      { apiKeys: [key('key_1', 'dup')], next: '1' },
      { apiKeys: [key('key_2', 'dup')], next: null },
    ]);

    await expect(findApiKeyByIdOrName(client, 'dup')).resolves.toEqual({
      error: 'ambiguous',
      count: 2,
    });
  });

  it('omits search for names longer than the api accepts', async () => {
    useMissingIdLookup();
    const long = 'k'.repeat(257);
    const queries = useKeyPages([
      { apiKeys: [key('key_1', long)], next: null },
    ]);

    const resolved = await findApiKeyByIdOrName(client, long);

    expect(resolved).toEqual({ apiKey: key('key_1', long) });
    expect(queries).toEqual([{ purpose: 'ai-gateway', limit: '100' }]);
  });

  it('returns incomplete instead of not found when pagination breaks', async () => {
    useMissingIdLookup();
    useKeyPages([
      { apiKeys: [], next: '1' },
      { apiKeys: [], next: '1' },
    ]);

    const resolved = await findApiKeyByIdOrName(client, 'staging');

    expect(resolved).toMatchObject({ error: 'incomplete' });
    if ('error' in resolved) {
      expect(describeApiKeyLookupError('staging', resolved)).toContain(
        'Could not search every API key for "staging"'
      );
    }
  });
});
