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
  vercelCliSupported: false,
  vercelCliAliases: [],
  vercelCliBodyArguments: [],
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

  it('returns ambiguous_operation when inferred alias matches multiple endpoints', () => {
    const r = resolveEndpointByTagAndOperationId(endpoints, 'user', 'list');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe('ambiguous_operation');
    }
  });

  describe('CLI alias matching', () => {
    const aliasedEndpoints: EndpointInfo[] = [
      base({
        path: '/v9/projects',
        method: 'GET',
        operationId: 'getProjects',
        tags: ['projects'],
        vercelCliAliases: ['ls', 'list'],
      }),
      base({
        path: '/v9/projects/{idOrName}',
        method: 'GET',
        operationId: 'getProject',
        tags: ['projects'],
        parameters: [{ name: 'idOrName', in: 'path', required: true }],
        vercelCliAliases: ['inspect', 'get'],
      }),
      base({
        path: '/v10/projects',
        method: 'POST',
        operationId: 'createProject',
        tags: ['projects'],
        vercelCliAliases: ['add', 'create'],
      }),
      base({
        path: '/v9/projects/{idOrName}',
        method: 'DELETE',
        operationId: 'deleteProject',
        tags: ['projects'],
        parameters: [{ name: 'idOrName', in: 'path', required: true }],
        vercelCliAliases: ['rm', 'remove'],
      }),
    ];

    it('resolves "ls" to the list operation via alias', () => {
      const r = resolveEndpointByTagAndOperationId(
        aliasedEndpoints,
        'projects',
        'ls'
      );
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.endpoint.operationId).toBe('getProjects');
      }
    });

    it('resolves "list" to the list operation via alias', () => {
      const r = resolveEndpointByTagAndOperationId(
        aliasedEndpoints,
        'projects',
        'list'
      );
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.endpoint.operationId).toBe('getProjects');
      }
    });

    it('resolves "inspect" to the single-resource GET via alias', () => {
      const r = resolveEndpointByTagAndOperationId(
        aliasedEndpoints,
        'projects',
        'inspect'
      );
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.endpoint.operationId).toBe('getProject');
      }
    });

    it('resolves "add" to the POST operation via alias', () => {
      const r = resolveEndpointByTagAndOperationId(
        aliasedEndpoints,
        'projects',
        'add'
      );
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.endpoint.operationId).toBe('createProject');
      }
    });

    it('resolves "rm" to the DELETE operation via alias', () => {
      const r = resolveEndpointByTagAndOperationId(
        aliasedEndpoints,
        'projects',
        'rm'
      );
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.endpoint.operationId).toBe('deleteProject');
      }
    });

    it('still resolves operationId directly alongside aliases', () => {
      const r = resolveEndpointByTagAndOperationId(
        aliasedEndpoints,
        'projects',
        'getProjects'
      );
      expect(r.ok).toBe(true);
      if (r.ok) {
        expect(r.endpoint.operationId).toBe('getProjects');
      }
    });

    it('returns ambiguous_operation when alias matches multiple endpoints', () => {
      const ambiguous: EndpointInfo[] = [
        base({
          path: '/v9/a',
          method: 'GET',
          operationId: 'listA',
          tags: ['things'],
          vercelCliAliases: ['ls'],
        }),
        base({
          path: '/v9/b',
          method: 'GET',
          operationId: 'listB',
          tags: ['things'],
          vercelCliAliases: ['ls'],
        }),
      ];
      const r = resolveEndpointByTagAndOperationId(ambiguous, 'things', 'ls');
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.reason).toBe('ambiguous_operation');
      }
    });
  });
});
