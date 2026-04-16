import { describe, expect, it } from 'vitest';
import { resolveEndpointByTagAndOperationId } from '../../../../src/util/openapi/resolve-by-tag-operation';
import type { EndpointInfo } from '../../../../src/util/openapi/types';

const base = (overrides: Partial<EndpointInfo>): EndpointInfo => ({
  path: '/v1/x',
  method: 'GET',
  summary: '',
  description: '',
  operationId: '',
  tags: [],
  parameters: [],
  aliases: [],
  ...overrides,
});

describe('resolveEndpointByTagAndOperationId', () => {
  const endpoints: EndpointInfo[] = [
    base({
      path: '/v2/user',
      method: 'GET',
      operationId: 'getAuthUser',
      tags: ['user'],
    }),
    base({
      path: '/v3/events',
      method: 'GET',
      operationId: 'listUserEvents',
      tags: ['user'],
    }),
    base({
      path: '/v1/events/types',
      method: 'GET',
      operationId: 'listEventTypes',
      tags: ['user'],
    }),
    base({
      path: '/v1/projects',
      method: 'GET',
      operationId: 'listProjects',
      tags: ['projects'],
    }),
  ];

  it('matches exact operationId', () => {
    const r = resolveEndpointByTagAndOperationId(
      endpoints,
      'user',
      'getAuthUser'
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.endpoint.path).toBe('/v2/user');
    }
  });

  it('matches operationId case-insensitively', () => {
    const r = resolveEndpointByTagAndOperationId(
      endpoints,
      'user',
      'getauthuser'
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.endpoint.operationId).toBe('getAuthUser');
    }
  });

  it('does not match operationId by prefix', () => {
    const r = resolveEndpointByTagAndOperationId(endpoints, 'user', 'get');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('no_operation');
    }
  });

  it('returns no_tag when tag is unknown', () => {
    const r = resolveEndpointByTagAndOperationId(endpoints, 'nope', 'get');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('no_tag');
    }
  });

  it('returns no_operation when hint is not an exact operationId or alias', () => {
    const r = resolveEndpointByTagAndOperationId(endpoints, 'user', 'deploy');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('no_operation');
    }
  });

  it('matches by x-vercel-cli alias', () => {
    const epsWithAlias: EndpointInfo[] = [
      base({
        path: '/v2/teams',
        method: 'GET',
        operationId: 'getTeams',
        tags: ['teams'],
        aliases: ['list'],
      }),
      base({
        path: '/v1/teams',
        method: 'POST',
        operationId: 'createTeam',
        tags: ['teams'],
        aliases: ['create'],
      }),
    ];

    const r = resolveEndpointByTagAndOperationId(epsWithAlias, 'teams', 'list');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.endpoint.operationId).toBe('getTeams');
    }
  });

  it('matches alias case-insensitively', () => {
    const epsWithAlias: EndpointInfo[] = [
      base({
        path: '/v2/teams',
        method: 'GET',
        operationId: 'getTeams',
        tags: ['teams'],
        aliases: ['list'],
      }),
    ];

    const r = resolveEndpointByTagAndOperationId(epsWithAlias, 'teams', 'List');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.endpoint.operationId).toBe('getTeams');
    }
  });

  it('prefers exact operationId over alias match', () => {
    const eps: EndpointInfo[] = [
      base({
        path: '/v2/teams',
        method: 'GET',
        operationId: 'list',
        tags: ['teams'],
        aliases: [],
      }),
      base({
        path: '/v1/teams',
        method: 'POST',
        operationId: 'createTeam',
        tags: ['teams'],
        aliases: ['list'],
      }),
    ];

    const r = resolveEndpointByTagAndOperationId(eps, 'teams', 'list');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.endpoint.operationId).toBe('list');
    }
  });
});
