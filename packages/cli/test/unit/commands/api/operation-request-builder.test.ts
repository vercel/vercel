import { describe, expect, it } from 'vitest';
import {
  applyContextDefaults,
  getUnsetOptionalOperationParams,
  parseOperationKeyValuePairs,
} from '../../../../src/commands/api/operation-request-builder';
import type { EndpointInfo } from '../../../../src/commands/api/types';

describe('operation-request-builder', () => {
  describe('getUnsetOptionalOperationParams', () => {
    it('includes teamId when declared on the operation and not yet provided', async () => {
      const endpoint: EndpointInfo = {
        path: '/v9/projects/{idOrName}',
        method: 'GET',
        operationId: 'getProject',
        summary: '',
        description: '',
        tags: ['projects'],
        aliases: [],
        parameters: [
          {
            name: 'idOrName',
            in: 'path',
            required: true,
            description: '',
          },
          {
            name: 'teamId',
            in: 'query',
            required: false,
            description: 'Scope',
          },
        ],
      };

      const parsed = await parseOperationKeyValuePairs(endpoint, [], {}, [
        'idOrName=my-app',
      ]);

      const unset = getUnsetOptionalOperationParams(endpoint, [], parsed, {});
      expect(unset.query.map(p => p.name)).toContain('teamId');
    });

    it('does not list teamId when already provided', async () => {
      const endpoint: EndpointInfo = {
        path: '/v9/projects/{idOrName}',
        method: 'GET',
        operationId: 'getProject',
        summary: '',
        description: '',
        tags: ['projects'],
        aliases: [],
        parameters: [
          {
            name: 'idOrName',
            in: 'path',
            required: true,
            description: '',
          },
          {
            name: 'teamId',
            in: 'query',
            required: false,
            description: '',
          },
        ],
      };

      const parsed = await parseOperationKeyValuePairs(endpoint, [], {}, [
        'idOrName=my-app',
        'teamId=team_xyz',
      ]);

      const unset = getUnsetOptionalOperationParams(endpoint, [], parsed, {});
      expect(unset.query.map(p => p.name)).not.toContain('teamId');
    });
  });

  describe('bare positional args', () => {
    it('assigns bare positional to first unfilled required path param', async () => {
      const endpoint: EndpointInfo = {
        path: '/v3/teams/{teamId}/members',
        method: 'GET',
        operationId: 'getTeamMembers',
        summary: '',
        description: '',
        tags: ['teams'],
        aliases: ['members'],
        parameters: [
          { name: 'teamId', in: 'path', required: true, description: '' },
        ],
      };

      const parsed = await parseOperationKeyValuePairs(endpoint, [], {}, [
        'team_abc123',
      ]);
      expect(parsed.pathValues['teamId']).toBe('team_abc123');
    });

    it('assigns multiple bare positionals to path params in order', async () => {
      const endpoint: EndpointInfo = {
        path: '/v1/teams/{teamId}/members/{uid}',
        method: 'PATCH',
        operationId: 'updateTeamMember',
        summary: '',
        description: '',
        tags: ['teams'],
        aliases: [],
        parameters: [
          { name: 'teamId', in: 'path', required: true, description: '' },
          { name: 'uid', in: 'path', required: true, description: '' },
        ],
      };

      const parsed = await parseOperationKeyValuePairs(endpoint, [], {}, [
        'team_abc',
        'user_xyz',
      ]);
      expect(parsed.pathValues['teamId']).toBe('team_abc');
      expect(parsed.pathValues['uid']).toBe('user_xyz');
    });

    it('mixes bare positionals and key=value pairs', async () => {
      const endpoint: EndpointInfo = {
        path: '/v1/teams/{teamId}/members/{uid}',
        method: 'PATCH',
        operationId: 'updateTeamMember',
        summary: '',
        description: '',
        tags: ['teams'],
        aliases: [],
        parameters: [
          { name: 'teamId', in: 'path', required: true, description: '' },
          { name: 'uid', in: 'path', required: true, description: '' },
        ],
      };

      const parsed = await parseOperationKeyValuePairs(endpoint, [], {}, [
        'teamId=team_abc',
        'user_xyz',
      ]);
      expect(parsed.pathValues['teamId']).toBe('team_abc');
      expect(parsed.pathValues['uid']).toBe('user_xyz');
    });

    it('throws when bare positional has no unfilled path params', async () => {
      const endpoint: EndpointInfo = {
        path: '/v3/teams/{teamId}/members',
        method: 'GET',
        operationId: 'getTeamMembers',
        summary: '',
        description: '',
        tags: ['teams'],
        aliases: ['members'],
        parameters: [
          { name: 'teamId', in: 'path', required: true, description: '' },
        ],
      };

      await expect(
        parseOperationKeyValuePairs(endpoint, [], {}, [
          'team_abc',
          'extra_value',
        ])
      ).rejects.toThrow(/Unexpected positional argument "extra_value"/);
    });
  });

  describe('applyContextDefaults', () => {
    it('fills missing teamId path param from scope context', async () => {
      const endpoint: EndpointInfo = {
        path: '/v3/teams/{teamId}/members',
        method: 'GET',
        operationId: 'getTeamMembers',
        summary: '',
        description: '',
        tags: ['teams'],
        aliases: ['members'],
        parameters: [
          { name: 'teamId', in: 'path', required: true, description: '' },
          { name: 'slug', in: 'query', required: false, description: '' },
        ],
      };

      const parsed = await parseOperationKeyValuePairs(endpoint, [], {}, []);
      expect(parsed.pathValues['teamId']).toBeUndefined();

      applyContextDefaults(endpoint, parsed, {
        scope: 'team_abc',
      });
      expect(parsed.pathValues['teamId']).toBe('team_abc');
    });

    it('does not overwrite explicit teamId with context', async () => {
      const endpoint: EndpointInfo = {
        path: '/v3/teams/{teamId}/members',
        method: 'GET',
        operationId: 'getTeamMembers',
        summary: '',
        description: '',
        tags: ['teams'],
        aliases: ['members'],
        parameters: [
          { name: 'teamId', in: 'path', required: true, description: '' },
        ],
      };

      const parsed = await parseOperationKeyValuePairs(endpoint, [], {}, [
        'teamId=team_explicit',
      ]);
      applyContextDefaults(endpoint, parsed, {
        scope: 'team_default',
      });
      expect(parsed.pathValues['teamId']).toBe('team_explicit');
    });

    it('fills missing teamId query param from scope context', async () => {
      const endpoint: EndpointInfo = {
        path: '/v10/projects',
        method: 'GET',
        operationId: 'getProjects',
        summary: '',
        description: '',
        tags: ['projects'],
        aliases: ['list'],
        parameters: [
          { name: 'teamId', in: 'query', required: false, description: '' },
        ],
      };

      const parsed = await parseOperationKeyValuePairs(endpoint, [], {}, []);
      applyContextDefaults(endpoint, parsed, { scope: 'team_abc' });
      expect(parsed.queryValues['teamId']).toBe('team_abc');
    });

    it('fills idOrName from projectId context for projects tag', async () => {
      const endpoint: EndpointInfo = {
        path: '/v9/projects/{idOrName}',
        method: 'GET',
        operationId: 'getProject',
        summary: '',
        description: '',
        tags: ['projects'],
        aliases: ['get'],
        parameters: [
          { name: 'idOrName', in: 'path', required: true, description: '' },
        ],
      };

      const parsed = await parseOperationKeyValuePairs(endpoint, [], {}, []);
      applyContextDefaults(endpoint, parsed, {
        projectId: 'prj_linked123',
      });
      expect(parsed.pathValues['idOrName']).toBe('prj_linked123');
    });

    it('does not fill idOrName for access-groups tag', async () => {
      const endpoint: EndpointInfo = {
        path: '/v1/access-groups/{idOrName}',
        method: 'GET',
        operationId: 'readAccessGroup',
        summary: '',
        description: '',
        tags: ['access-groups'],
        aliases: ['read', 'get'],
        parameters: [
          { name: 'idOrName', in: 'path', required: true, description: '' },
        ],
      };

      const parsed = await parseOperationKeyValuePairs(endpoint, [], {}, []);
      applyContextDefaults(endpoint, parsed, {
        projectId: 'prj_linked123',
      });
      expect(parsed.pathValues['idOrName']).toBeUndefined();
    });

    it('fills projectIdOrName from projectId context', async () => {
      const endpoint: EndpointInfo = {
        path: '/v2/projects/{projectIdOrName}/checks',
        method: 'GET',
        operationId: 'listProjectChecks',
        summary: '',
        description: '',
        tags: ['checks-v2'],
        aliases: [],
        parameters: [
          {
            name: 'projectIdOrName',
            in: 'path',
            required: true,
            description: '',
          },
        ],
      };

      const parsed = await parseOperationKeyValuePairs(endpoint, [], {}, []);
      applyContextDefaults(endpoint, parsed, {
        projectId: 'prj_linked123',
      });
      expect(parsed.pathValues['projectIdOrName']).toBe('prj_linked123');
    });

    it('does nothing when no context is provided', async () => {
      const endpoint: EndpointInfo = {
        path: '/v3/teams/{teamId}/members',
        method: 'GET',
        operationId: 'getTeamMembers',
        summary: '',
        description: '',
        tags: ['teams'],
        aliases: ['members'],
        parameters: [
          { name: 'teamId', in: 'path', required: true, description: '' },
        ],
      };

      const parsed = await parseOperationKeyValuePairs(endpoint, [], {}, []);
      applyContextDefaults(endpoint, parsed, undefined);
      expect(parsed.pathValues['teamId']).toBeUndefined();
    });

    it('returns set of auto-filled param names', async () => {
      const endpoint: EndpointInfo = {
        path: '/v3/teams/{teamId}/members',
        method: 'GET',
        operationId: 'getTeamMembers',
        summary: '',
        description: '',
        tags: ['teams'],
        aliases: ['members'],
        parameters: [
          { name: 'teamId', in: 'path', required: true, description: '' },
          { name: 'slug', in: 'query', required: false, description: '' },
        ],
      };

      const parsed = await parseOperationKeyValuePairs(endpoint, [], {}, []);
      const filled = applyContextDefaults(endpoint, parsed, {
        scope: 'team_abc',
      });
      expect(filled.has('teamId')).toBe(true);
      expect(filled.has('slug')).toBe(false);
    });
  });
});
