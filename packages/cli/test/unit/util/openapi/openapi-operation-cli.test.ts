import { describe, expect, it } from 'vitest';
import {
  buildOpenapiInvocationUrlAfterPathSubstitution,
  composeOpenapiInvocationUrl,
  extractBracePathParamNames,
  getOpenapiQueryOptionParameters,
  operationDeclaresTeamOrSlugQueryParam,
  parameterNameToCliOptionFlag,
  parseOpenapiOptionFlagTokens,
  resolveOpenapiInvocationUrl,
  splitOpenapiInvocationPositionals,
} from '../../../../src/util/openapi/openapi-operation-cli';
import type { EndpointInfo } from '../../../../src/util/openapi/types';

describe('openapi-operation-cli', () => {
  it('operationDeclaresTeamOrSlugQueryParam detects teamId/slug query params', () => {
    const withTeam: EndpointInfo = {
      path: '/x',
      method: 'GET',
      summary: '',
      description: '',
      operationId: 'a',
      tags: [],
      parameters: [
        {
          name: 'teamId',
          in: 'query',
          schema: { type: 'string' },
        },
      ],
      responses: {},
      vercelCliSupported: true,
      vercelCliAliases: [],
    };
    expect(operationDeclaresTeamOrSlugQueryParam(withTeam)).toBe(true);

    const noScope: EndpointInfo = {
      ...withTeam,
      parameters: [
        {
          name: 'limit',
          in: 'query',
          schema: { type: 'number' },
        },
      ],
    };
    expect(operationDeclaresTeamOrSlugQueryParam(noScope)).toBe(false);
  });

  it('extractBracePathParamNames preserves template order', () => {
    expect(extractBracePathParamNames('/v1/{a}/{b}/x')).toEqual(['a', 'b']);
  });

  it('parameterNameToCliOptionFlag uses kebab-case', () => {
    expect(parameterNameToCliOptionFlag('teamId')).toBe('team-id');
  });

  it('splitOpenapiInvocationPositionals separates path values and option tail', () => {
    const pos = [
      'openapi',
      'tag',
      'op',
      'p1',
      'p2',
      '--team-id=x',
      '--verbose',
    ];
    expect(splitOpenapiInvocationPositionals(pos)).toEqual({
      pathValues: ['p1', 'p2'],
      optionArgvTail: ['--team-id=x', '--verbose'],
    });
  });

  it('parseOpenapiOptionFlagTokens parses = and separate value', () => {
    const q = [
      {
        name: 'teamId',
        in: 'query' as const,
        schema: { type: 'string' },
      },
      {
        name: 'slug',
        in: 'query' as const,
        schema: { type: 'string' },
      },
    ];
    expect(
      parseOpenapiOptionFlagTokens(['--team-id=a', '--slug', 's'], q).values
    ).toEqual({ teamId: 'a', slug: 's' });
  });

  it('resolveOpenapiInvocationUrl substitutes path and query', () => {
    const endpoint: EndpointInfo = {
      path: '/v1/projects/{projectId}/rolling-release',
      method: 'DELETE',
      summary: '',
      description: '',
      operationId: 'x',
      tags: ['rolling-release'],
      parameters: [
        {
          name: 'projectId',
          in: 'path',
          required: true,
          schema: { type: 'string' },
        },
        {
          name: 'teamId',
          in: 'query',
          schema: { type: 'string' },
        },
      ],
      responses: {},
      vercelCliSupported: true,
      vercelCliAliases: [],
    };
    const r = resolveOpenapiInvocationUrl({
      endpoint,
      positionalArgs: [
        'openapi',
        'rolling-release',
        'x',
        'my-proj',
        '--team-id=t1',
      ],
    });
    expect(r).toEqual({
      url: '/v1/projects/my-proj/rolling-release?teamId=t1',
    });
  });

  it('composeOpenapiInvocationUrl matches resolveOpenapiInvocationUrl for full argv', () => {
    const endpoint: EndpointInfo = {
      path: '/v1/projects/{projectId}/rolling-release',
      method: 'DELETE',
      summary: '',
      description: '',
      operationId: 'x',
      tags: ['rolling-release'],
      parameters: [
        {
          name: 'projectId',
          in: 'path',
          required: true,
          schema: { type: 'string' },
        },
        {
          name: 'teamId',
          in: 'query',
          schema: { type: 'string' },
        },
      ],
      responses: {},
      vercelCliSupported: true,
      vercelCliAliases: [],
    };
    const positionalArgs = [
      'openapi',
      'rolling-release',
      'x',
      'my-proj',
      '--team-id=t1',
    ];
    const { pathValues, optionArgvTail } =
      splitOpenapiInvocationPositionals(positionalArgs);
    const parsed = parseOpenapiOptionFlagTokens(
      optionArgvTail,
      getOpenapiQueryOptionParameters(endpoint)
    );
    expect(parsed.error).toBeUndefined();
    const composed = composeOpenapiInvocationUrl(
      endpoint,
      pathValues,
      parsed.values
    );
    const resolved = resolveOpenapiInvocationUrl({ endpoint, positionalArgs });
    expect(composed).toEqual(resolved);
  });

  it('buildOpenapiInvocationUrlAfterPathSubstitution requires query options', () => {
    const endpoint: EndpointInfo = {
      path: '/x',
      method: 'GET',
      summary: '',
      description: '',
      operationId: 'op',
      tags: ['t'],
      parameters: [
        {
          name: 'q',
          in: 'query',
          required: true,
          schema: { type: 'string' },
        },
      ],
      responses: {},
      vercelCliSupported: true,
      vercelCliAliases: [],
    };
    expect(
      buildOpenapiInvocationUrlAfterPathSubstitution('/x', endpoint, {})
    ).toEqual({
      error: 'Missing required option --q.',
    });
    expect(
      buildOpenapiInvocationUrlAfterPathSubstitution('/x', endpoint, { q: '1' })
    ).toEqual({ url: '/x?q=1' });
  });

  it('resolveOpenapiInvocationUrl errors on path arity mismatch', () => {
    const endpoint: EndpointInfo = {
      path: '/v1/projects/{projectId}/rolling-release',
      method: 'DELETE',
      summary: '',
      description: '',
      operationId: 'x',
      tags: ['t'],
      parameters: [
        {
          name: 'projectId',
          in: 'path',
          required: true,
          schema: { type: 'string' },
        },
      ],
      responses: {},
      vercelCliSupported: true,
      vercelCliAliases: [],
    };
    const r = resolveOpenapiInvocationUrl({
      endpoint,
      positionalArgs: ['openapi', 't', 'x'],
    });
    expect(r).toEqual({
      error: 'Missing path argument(s): expected 1 ({projectId}), got 0.',
    });
  });
});
