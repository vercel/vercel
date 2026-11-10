import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  matchesCliApiTag,
  resolveOpenApiTagForProjectsCli,
} from '../../../../src/util/openapi/matches-cli-api-tag';
import { OpenApiCache } from '../../../../src/util/openapi/openapi-cache';
import type { EndpointInfo } from '../../../../src/util/openapi/types';

const sampleEndpoint: EndpointInfo = {
  path: '/v9/projects',
  method: 'GET',
  operationId: 'getProjects',
  summary: '',
  description: '',
  tags: ['projects'],
  parameters: [],
};

describe('matchesCliApiTag', () => {
  beforeEach(() => {
    vi.spyOn(OpenApiCache.prototype, 'load').mockResolvedValue(true);
    vi.spyOn(OpenApiCache.prototype, 'getEndpoints').mockReturnValue([
      sampleEndpoint,
    ]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns true when a tag matches case-insensitively', async () => {
    await expect(matchesCliApiTag('projects')).resolves.toBe(true);
    await expect(matchesCliApiTag('PROJECTS')).resolves.toBe(true);
  });

  it('returns false when no tag matches', async () => {
    await expect(matchesCliApiTag('not-a-tag')).resolves.toBe(false);
  });

  it('returns false when the spec fails to load', async () => {
    vi.spyOn(OpenApiCache.prototype, 'load').mockResolvedValue(false);
    await expect(matchesCliApiTag('projects')).resolves.toBe(false);
  });

  it('returns false for values that cannot be tags', async () => {
    await expect(matchesCliApiTag('')).resolves.toBe(false);
    await expect(matchesCliApiTag('-h')).resolves.toBe(false);
    await expect(matchesCliApiTag('foo/bar')).resolves.toBe(false);
  });

  describe('resolveOpenApiTagForProjectsCli', () => {
    it('prefers the projects tag when present', async () => {
      await expect(resolveOpenApiTagForProjectsCli()).resolves.toBe('projects');
    });

    it('returns null when the spec does not load', async () => {
      vi.spyOn(OpenApiCache.prototype, 'load').mockResolvedValue(false);
      await expect(resolveOpenApiTagForProjectsCli()).resolves.toBe(null);
    });
  });
});
