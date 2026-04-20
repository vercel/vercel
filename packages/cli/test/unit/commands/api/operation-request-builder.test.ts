import { describe, expect, it } from 'vitest';
import {
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
});
