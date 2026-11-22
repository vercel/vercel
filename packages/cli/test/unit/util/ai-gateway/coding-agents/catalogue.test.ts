import { describe, expect, it } from 'vitest';
import {
  agenticModels,
  defaultFirst,
  pinnedDefault,
} from '../../../../../src/util/ai-gateway/coding-agents/catalogue';
import type { Model } from '../../../../../src/util/ai-gateway/models';
import type { SetupContext } from '../../../../../src/util/ai-gateway/coding-agents/types';

function model(id: string, over: Partial<Model> = {}): Model {
  return {
    id,
    object: 'model',
    owned_by: id.split('/')[0],
    name: id,
    type: 'language',
    tags: ['tool-use'],
    context_window: 128_000,
    max_tokens: 8_192,
    ...over,
  };
}

function ctx(models: Model[] | undefined): SetupContext {
  return { apiKey: 'vck_test', home: '/tmp/home', gatewayModels: models };
}

describe('agenticModels', () => {
  it('keeps only live, tool-capable language models', () => {
    const models = [
      model('anthropic/keep'),
      model('vendor/no-tools', { tags: [] }),
      model('vendor/untagged', { tags: undefined }),
      model('vendor/embedding', { type: 'embedding' }),
      model('vendor/retired', { deprecated_at: 1_700_000_000_000 }),
    ];
    expect(agenticModels(ctx(models)).map(m => m.id)).toEqual([
      'anthropic/keep',
    ]);
  });

  it('gates on size only when the caller asks', () => {
    const models = [
      model('vendor/sized'),
      model('vendor/unsized', { context_window: undefined }),
      model('vendor/uncapped', { max_tokens: undefined }),
    ];
    expect(agenticModels(ctx(models))).toHaveLength(3);
    expect(
      agenticModels(ctx(models), { requireContextWindow: true }).map(m => m.id)
    ).toEqual(['vendor/sized', 'vendor/uncapped']);
    expect(
      agenticModels(ctx(models), { requireMaxTokens: true }).map(m => m.id)
    ).toEqual(['vendor/sized', 'vendor/unsized']);
    expect(
      agenticModels(ctx(models), {
        requireContextWindow: true,
        requireMaxTokens: true,
      }).map(m => m.id)
    ).toEqual(['vendor/sized']);
  });

  it('treats an unavailable catalogue as empty rather than throwing', () => {
    expect(agenticModels(ctx(undefined))).toEqual([]);
  });
});

describe('defaultFirst', () => {
  it('leads with the gateway default, then sorts the rest by id', () => {
    const models = [
      model('zed/z'),
      model('alibaba/a'),
      model('anthropic/claude-fable-5'),
      model('mistral/m'),
    ];
    expect(defaultFirst(models).map(m => m.id)).toEqual([
      'anthropic/claude-fable-5',
      'alibaba/a',
      'mistral/m',
      'zed/z',
    ]);
  });

  it('just sorts when the default is not in the catalogue', () => {
    const models = [model('zed/z'), model('alibaba/a')];
    expect(defaultFirst(models).map(m => m.id)).toEqual(['alibaba/a', 'zed/z']);
  });
});

describe('pinnedDefault', () => {
  const ctx = (over: object) =>
    ({ apiKey: 'k', home: '/tmp', ...over }) as never;
  const model = (id: string, released: number) => ({
    id,
    object: 'model',
    owned_by: id.split('/')[0],
    name: id,
    type: 'language',
    tags: ['tool-use'],
    context_window: 1000,
    released,
  });

  it('returns the leaderboard leader when no creator is given', () => {
    expect(pinnedDefault(ctx({ topModels: [{ id: 'a/x', name: 'X' }] }))).toBe(
      'a/x'
    );
  });

  it('falls back to the gateway default without a leaderboard', () => {
    expect(pinnedDefault(ctx({}))).toBe('anthropic/claude-fable-5');
  });

  it('prefers the creator family top, leaderboard-ranked before newest', () => {
    const gatewayModels = [model('acme/new', 2), model('acme/rank1', 1)];
    expect(
      pinnedDefault(
        ctx({
          gatewayModels,
          topModels: [{ id: 'acme/rank1', name: 'R1' }],
        }),
        { creator: 'acme' }
      )
    ).toBe('acme/rank1');
    expect(pinnedDefault(ctx({ gatewayModels }), { creator: 'acme' })).toBe(
      'acme/new'
    );
  });
});
