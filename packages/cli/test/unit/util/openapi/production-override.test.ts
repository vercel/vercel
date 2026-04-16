import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenApiCache } from '../../../../src/util/openapi/openapi-cache';
import { tryOpenApiProductionOverride } from '../../../../src/util/openapi/try-openapi-fallback';
import type { EndpointInfo } from '../../../../src/util/openapi/types';

const makeEndpoint = (overrides: Partial<EndpointInfo> = {}): EndpointInfo => ({
  path: '/v9/projects',
  method: 'GET',
  operationId: 'getProjects',
  summary: '',
  description: '',
  tags: ['projects'],
  parameters: [],
  vercelCliSupported: true,
  vercelCliProductionReady: false,
  vercelCliAliases: [],
  vercelCliBodyArguments: [],
  ...overrides,
});

describe('OpenApiCache production-ready methods', () => {
  beforeEach(() => {
    vi.spyOn(OpenApiCache.prototype, 'load').mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getProductionReadyEndpoints', () => {
    it('filters to only production-ready endpoints', () => {
      const endpoints = [
        makeEndpoint({
          operationId: 'getProjects',
          vercelCliProductionReady: true,
        }),
        makeEndpoint({
          operationId: 'createProject',
          method: 'POST',
          vercelCliProductionReady: false,
        }),
        makeEndpoint({
          operationId: 'deleteProject',
          method: 'DELETE',
          vercelCliProductionReady: true,
        }),
      ];
      vi.spyOn(OpenApiCache.prototype, 'getEndpoints').mockReturnValue(
        endpoints
      );

      const cache = new OpenApiCache();
      const result = cache.getProductionReadyEndpoints();
      expect(result).toHaveLength(2);
      expect(result.map(ep => ep.operationId)).toEqual([
        'getProjects',
        'deleteProject',
      ]);
    });

    it('returns empty array when none are production-ready', () => {
      vi.spyOn(OpenApiCache.prototype, 'getEndpoints').mockReturnValue([
        makeEndpoint({ vercelCliProductionReady: false }),
      ]);

      const cache = new OpenApiCache();
      expect(cache.getProductionReadyEndpoints()).toHaveLength(0);
    });
  });

  describe('findProductionReadyByTagAndHint', () => {
    it('finds endpoint by operationId', () => {
      const ep = makeEndpoint({
        operationId: 'getProjects',
        vercelCliProductionReady: true,
      });
      vi.spyOn(OpenApiCache.prototype, 'getEndpoints').mockReturnValue([ep]);

      const cache = new OpenApiCache();
      expect(
        cache.findProductionReadyByTagAndHint('projects', 'getProjects')
      ).toBe(ep);
    });

    it('finds endpoint by alias', () => {
      const ep = makeEndpoint({
        operationId: 'getProjects',
        vercelCliAliases: ['ls', 'list'],
        vercelCliProductionReady: true,
      });
      vi.spyOn(OpenApiCache.prototype, 'getEndpoints').mockReturnValue([ep]);

      const cache = new OpenApiCache();
      expect(cache.findProductionReadyByTagAndHint('projects', 'ls')).toBe(ep);
      expect(cache.findProductionReadyByTagAndHint('projects', 'list')).toBe(
        ep
      );
    });

    it('returns undefined when not production-ready', () => {
      const ep = makeEndpoint({
        operationId: 'getProjects',
        vercelCliProductionReady: false,
      });
      vi.spyOn(OpenApiCache.prototype, 'getEndpoints').mockReturnValue([ep]);

      const cache = new OpenApiCache();
      expect(
        cache.findProductionReadyByTagAndHint('projects', 'getProjects')
      ).toBeUndefined();
    });

    it('returns undefined when tag does not match', () => {
      const ep = makeEndpoint({
        operationId: 'getProjects',
        tags: ['projects'],
        vercelCliProductionReady: true,
      });
      vi.spyOn(OpenApiCache.prototype, 'getEndpoints').mockReturnValue([ep]);

      const cache = new OpenApiCache();
      expect(
        cache.findProductionReadyByTagAndHint('domains', 'getProjects')
      ).toBeUndefined();
    });

    it('matches case-insensitively', () => {
      const ep = makeEndpoint({
        operationId: 'getProjects',
        tags: ['projects'],
        vercelCliProductionReady: true,
      });
      vi.spyOn(OpenApiCache.prototype, 'getEndpoints').mockReturnValue([ep]);

      const cache = new OpenApiCache();
      expect(
        cache.findProductionReadyByTagAndHint('Projects', 'GetProjects')
      ).toBe(ep);
    });
  });

  describe('getAllProductionReadyTags', () => {
    it('returns sorted unique tags from production-ready endpoints', () => {
      const endpoints = [
        makeEndpoint({
          tags: ['projects'],
          vercelCliProductionReady: true,
        }),
        makeEndpoint({
          tags: ['domains'],
          vercelCliProductionReady: true,
        }),
        makeEndpoint({
          tags: ['projects'],
          operationId: 'createProject',
          vercelCliProductionReady: true,
        }),
        makeEndpoint({
          tags: ['dns'],
          vercelCliProductionReady: false,
        }),
      ];
      vi.spyOn(OpenApiCache.prototype, 'getEndpoints').mockReturnValue(
        endpoints
      );

      const cache = new OpenApiCache();
      expect(cache.getAllProductionReadyTags()).toEqual([
        'domains',
        'projects',
      ]);
    });
  });
});

describe('tryOpenApiProductionOverride', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns null for unmapped command names', async () => {
    const client = {} as any;
    const result = await tryOpenApiProductionOverride(
      client,
      'unknown-command',
      ['ls']
    );
    expect(result).toBeNull();
  });

  it('returns null when no subcommand hint is provided', async () => {
    const client = {} as any;
    const result = await tryOpenApiProductionOverride(client, 'project', []);
    expect(result).toBeNull();
  });

  it('returns null when only flags are provided (no subcommand)', async () => {
    const client = {} as any;
    const result = await tryOpenApiProductionOverride(client, 'project', [
      '--help',
    ]);
    expect(result).toBeNull();
  });

  it('returns null when spec fails to load', async () => {
    vi.spyOn(OpenApiCache.prototype, 'load').mockResolvedValue(false);
    const client = {} as any;
    const result = await tryOpenApiProductionOverride(client, 'project', [
      'ls',
    ]);
    expect(result).toBeNull();
  });

  it('returns null when no production-ready match exists', async () => {
    vi.spyOn(OpenApiCache.prototype, 'load').mockResolvedValue(true);
    vi.spyOn(OpenApiCache.prototype, 'getEndpoints').mockReturnValue([
      makeEndpoint({
        operationId: 'getProjects',
        vercelCliAliases: ['ls', 'list'],
        vercelCliProductionReady: false,
      }),
    ]);
    const client = {} as any;
    const result = await tryOpenApiProductionOverride(client, 'project', [
      'ls',
    ]);
    expect(result).toBeNull();
  });
});
