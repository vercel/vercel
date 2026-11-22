import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { client } from '../../../../mocks/client';
import { useUser } from '../../../../mocks/user';
import {
  fetchTopModels,
  resolveTopModels,
  TOP_MODELS_LIMIT,
} from '../../../../../src/util/ai-gateway/coding-agents/top-models';
import type {
  LeaderboardMetric,
  LeaderboardTimeseriesRow,
} from '../../../../../src/util/ai-gateway/leaderboard';
import type { Model } from '../../../../../src/util/ai-gateway/models';

function row(
  name: string,
  share: number,
  opts: { date?: string; metric?: LeaderboardMetric } = {}
): LeaderboardTimeseriesRow {
  return {
    date: opts.date ?? '2026-08-12',
    group: 'model',
    name,
    metric: opts.metric ?? 'spend',
    modality: 'text',
    share_percent: share,
  };
}

function model(id: string, name: string): Model {
  return { id, object: 'model', owned_by: id.split('/')[0], name };
}

const catalog = [
  model('anthropic/claude-opus-5', 'Claude Opus 5'),
  model('anthropic/claude-sonnet-5', 'Claude Sonnet 5'),
  model('moonshotai/kimi-k3', 'Kimi K3'),
  model('openai/gpt-5-nano', 'GPT-5 nano'),
];

describe('resolveTopModels', () => {
  it('ranks by spend share and resolves display names to gateway slugs', () => {
    const rows = [
      row('Kimi K3', 4.97),
      row('Claude Opus 5', 24.72),
      row('Claude Sonnet 5', 5.67),
    ];
    expect(resolveTopModels(rows, catalog)).toEqual([
      { id: 'anthropic/claude-opus-5', name: 'Claude Opus 5' },
      { id: 'anthropic/claude-sonnet-5', name: 'Claude Sonnet 5' },
      { id: 'moonshotai/kimi-k3', name: 'Kimi K3' },
    ]);
  });

  it('drops the synthetic Other bucket', () => {
    const rows = [row('Other', 90), row('Claude Opus 5', 10)];
    expect(resolveTopModels(rows, catalog)).toEqual([
      { id: 'anthropic/claude-opus-5', name: 'Claude Opus 5' },
    ]);
  });

  it('drops Other even when it would otherwise resolve to a slug', () => {
    const rows = [
      { ...row('Other', 90), slug: 'acme/other' },
      row('Claude Opus 5', 10),
    ];
    const withOther = [...catalog, model('acme/other', 'Other')];
    expect(resolveTopModels(rows, withOther)).toEqual([
      { id: 'anthropic/claude-opus-5', name: 'Claude Opus 5' },
    ]);
  });

  it('uses only the most recent day', () => {
    const rows = [
      row('Kimi K3', 99, { date: '2026-08-01' }),
      row('Claude Opus 5', 1, { date: '2026-08-12' }),
    ];
    expect(resolveTopModels(rows, catalog)).toEqual([
      { id: 'anthropic/claude-opus-5', name: 'Claude Opus 5' },
    ]);
  });

  it('ignores rows for other metrics', () => {
    const rows = [
      row('GPT-5 nano', 99, { metric: 'requests' }),
      row('Claude Opus 5', 1),
    ];
    expect(resolveTopModels(rows, catalog)).toEqual([
      { id: 'anthropic/claude-opus-5', name: 'Claude Opus 5' },
    ]);
  });

  it('drops names absent from the catalog rather than guessing a slug', () => {
    const rows = [row('Some Unlisted Model', 50), row('Kimi K3', 10)];
    expect(resolveTopModels(rows, catalog)).toEqual([
      { id: 'moonshotai/kimi-k3', name: 'Kimi K3' },
    ]);
  });

  it('matches names case- and whitespace-insensitively', () => {
    expect(resolveTopModels([row('  claude OPUS 5 ', 10)], catalog)).toEqual([
      { id: 'anthropic/claude-opus-5', name: 'Claude Opus 5' },
    ]);
  });

  it('prefers a slug on the row when the export starts providing one', () => {
    const rows = [
      { ...row('Renamed Upstream', 10), slug: 'anthropic/claude-opus-5' },
    ];
    expect(resolveTopModels(rows, catalog)).toEqual([
      { id: 'anthropic/claude-opus-5', name: 'Claude Opus 5' },
    ]);
  });

  it('keeps a row whose slug is unknown to the catalog, using its own name', () => {
    const rows = [{ ...row('Brand New', 10), slug: 'acme/brand-new' }];
    expect(resolveTopModels(rows, catalog)).toEqual([
      { id: 'acme/brand-new', name: 'Brand New' },
    ]);
  });

  it('dedupes ids that several display names fold onto', () => {
    const rows = [
      { ...row('Claude Opus 5', 20), slug: 'anthropic/claude-opus-5' },
      { ...row('Claude Opus 5 (alias)', 10), slug: 'anthropic/claude-opus-5' },
    ];
    expect(resolveTopModels(rows, catalog)).toHaveLength(1);
  });

  it('caps the list at the limit', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      ...row(`M${i}`, 100 - i),
      slug: `acme/m${i}`,
    }));
    expect(resolveTopModels(many, catalog)).toHaveLength(TOP_MODELS_LIMIT);
    expect(resolveTopModels(many, catalog, 3)).toHaveLength(3);
  });

  it('returns nothing when there are no rows', () => {
    expect(resolveTopModels([], catalog)).toEqual([]);
  });
});

describe('resolveTopModels ambiguity', () => {
  it('drops rows whose display name maps to more than one catalog id', () => {
    const dupCatalog = [
      ...catalog,
      { ...model('anthropic/claude-opus-5-fast', 'Claude Opus 5') },
    ];
    const rows = [row('Claude Opus 5', 24.72), row('Kimi K3', 4.97)];
    expect(resolveTopModels(rows, dupCatalog)).toEqual([
      { id: 'moonshotai/kimi-k3', name: 'Kimi K3' },
    ]);
  });
});

describe('fetchTopModels', () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {
      VERCEL_LEADERBOARD_URL: process.env.VERCEL_LEADERBOARD_URL,
      VERCEL_AI_GATEWAY_URL: process.env.VERCEL_AI_GATEWAY_URL,
    };
    process.env.VERCEL_LEADERBOARD_URL = client.apiUrl;
    process.env.VERCEL_AI_GATEWAY_URL = client.apiUrl;
    useUser();
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  function useEndpoints(rows: unknown[], models: unknown[] = catalog) {
    client.scenario.get('/api/ai/leaderboard-export', (_req, res) => {
      res.json({ dataset: 'models', modality: 'text', rows });
    });
    client.scenario.get('/v1/models', (_req, res) => {
      res.json({ object: 'list', data: models });
    });
  }

  it('returns the ranked, slug-resolved list', async () => {
    useEndpoints([
      row('Claude Opus 5', 24.72),
      row('Other', 22.32),
      row('Claude Sonnet 5', 5.67),
      row('Kimi K3', 4.97),
    ]);
    await expect(fetchTopModels(client)).resolves.toEqual([
      { id: 'anthropic/claude-opus-5', name: 'Claude Opus 5' },
      { id: 'anthropic/claude-sonnet-5', name: 'Claude Sonnet 5' },
      { id: 'moonshotai/kimi-k3', name: 'Kimi K3' },
    ]);
  });

  it('requests the models dataset for the text modality', async () => {
    let query: Record<string, string> | undefined;
    client.scenario.get('/api/ai/leaderboard-export', (req, res) => {
      query = req.query;
      res.json({ dataset: 'models', modality: 'text', rows: [] });
    });
    client.scenario.get('/v1/models', (_req, res) => {
      res.json({ object: 'list', data: catalog });
    });
    await fetchTopModels(client);
    expect(query).toMatchObject({
      dataset: 'models',
      modality: 'text',
      format: 'json',
    });
  });

  it('returns null when the leaderboard errors, so callers keep their own list', async () => {
    client.scenario.get('/api/ai/leaderboard-export', (_req, res) => {
      res.status(500).json({ error: { code: 'boom', message: 'boom' } });
    });
    client.scenario.get('/v1/models', (_req, res) => {
      res.json({ object: 'list', data: catalog });
    });
    await expect(fetchTopModels(client)).resolves.toBeNull();
  });

  it('returns null when the catalog errors', async () => {
    client.scenario.get('/api/ai/leaderboard-export', (_req, res) => {
      res.json({ dataset: 'models', modality: 'text', rows: [] });
    });
    client.scenario.get('/v1/models', (_req, res) => {
      res.status(500).json({ error: { code: 'boom', message: 'boom' } });
    });
    await expect(fetchTopModels(client)).resolves.toBeNull();
  });

  it('returns null rather than a list too thin to be useful', async () => {
    useEndpoints([row('Claude Opus 5', 50), row('Unlisted', 50)]);
    await expect(fetchTopModels(client)).resolves.toBeNull();
  });

  it('returns null when the lookup outlives its timeout', async () => {
    client.scenario.get('/api/ai/leaderboard-export', (_req, res) => {
      setTimeout(() => res.json({ rows: [] }), 200).unref?.();
    });
    client.scenario.get('/v1/models', (_req, res) => {
      res.json({ object: 'list', data: catalog });
    });
    await expect(fetchTopModels(client, { timeoutMs: 20 })).resolves.toBeNull();
  });
});
