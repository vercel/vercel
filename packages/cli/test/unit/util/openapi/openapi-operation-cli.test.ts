import { describe, expect, it } from 'vitest';
import {
  extractBracePathParamNames,
  parameterNameToCliOptionFlag,
  parseOpenapiOptionFlagTokens,
  resolveOpenapiInvocationUrl,
  splitOpenapiInvocationPositionals,
} from '../../../../src/util/openapi/openapi-operation-cli';
import type { EndpointInfo } from '../../../../src/util/openapi/types';

describe('openapi-operation-cli', () => {
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
